import os
import sqlite3
import time
import urllib.request
from datetime import datetime, timedelta
import pytz
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, session, redirect, url_for, g, flash
from werkzeug.security import generate_password_hash, check_password_hash
from pykrx import stock

app = Flask(__name__)
app.secret_key = os.urandom(24) 
DATABASE = 'database.db'

# --- 환경 변수 정의 ---
DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
DATABASE_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_IMAGE_API_KEY = os.environ.get("NVIDIA_IMAGE_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# --- 메모리 기반 보안 락 ---
LAST_ORDER_TIME = {}  
CHAT_HISTORY = {}     
CHAT_BANS = {}   

KST = pytz.timezone('Asia/Seoul')

def is_market_open():
    now_kst = datetime.now(KST)
    if now_kst.weekday() >= 5: return False
    current_minutes = now_kst.hour * 60 + now_kst.minute
    return 540 <= current_minutes < 930

def get_single_stock_price(code):
    now = datetime.now(KST)
    start_date = (now - timedelta(days=15)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    try:
        df = stock.get_market_ohlcv(start_date.replace('-', ''), end_date.replace('-', ''), code)
        if not df.empty: return int(df.iloc[-1]['종가'])
    except: pass

    try:
        import FinanceDataReader as fdr
        df = fdr.DataReader(code, start_date, end_date)
        if not df.empty: return int(df.iloc[-1]['Close'])
    except: pass

    try:
        import yfinance as yf
        yf_code = f"{code}.KS" if not str(code).startswith('0') else f"{code}.KQ"
        df = yf.download(yf_code, start=start_date, end=end_date, progress=False)
        if not df.empty: return int(df.iloc[-1]['Close'])
    except: pass
    return None

def get_stock_news_scraped(code):
    url = f"https://finance.naver.com/item/news_news.naver?code={code}&page=1"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': f'https://finance.naver.com/item/news.naver?code={code}'
    }
    news_list = []
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4) as response:
            html = response.read().decode('cp949', errors='ignore')
        soup = BeautifulSoup(html, 'html.parser')
        rows = soup.select('.type5 tr')
        for row in rows:
            title_el = row.select_one('.title a')
            info_el = row.select_one('.info')
            date_el = row.select_one('.date')
            if title_el:
                title = title_el.get_text(strip=True)
                link = "https://finance.naver.com" + title_el['href']
                provider = info_el.get_text(strip=True) if info_el else "언론사"
                date_str = date_el.get_text(strip=True) if date_el else ""
                news_list.append({'title': title, 'link': link, 'provider': provider, 'date': date_str})
    except Exception as e: print(f"News Crawling Error: {e}")
    return news_list[:15]

def patch_libsql_result(result):
    if not hasattr(result, 'fetchone'):
        result.fetchone = lambda: result.rows[0] if result.rows else None
    if not hasattr(result, 'fetchall'):
        result.fetchall = lambda: result.rows
    return result

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        if DATABASE_URL:
            import libsql_client
            target_url = DATABASE_URL.replace("libsql://", "https://")
            client = libsql_client.create_client_sync(url=target_url, auth_token=DATABASE_TOKEN)
            class DBWrapper:
                def __init__(self, client): self.client = client
                def execute(self, query, args=()): return FetchWrapper(self.client.execute(query, args))
                def commit(self): pass
                def cursor(self): return self
            class FetchWrapper:
                def __init__(self, result): self.rows = result.rows
                def fetchone(self): return self.rows[0] if self.rows else None
                def fetchall(self): return self.rows
            db = g._database = DBWrapper(client)
        else:
            db = g._database = sqlite3.connect(DATABASE)
            db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None and not isinstance(db, type(None)):
        try:
            if isinstance(db, sqlite3.Connection): db.close()
        except: pass

def init_db():
    # Turso DB 연동 환경이므로 서버 구동 시의 테이블 CREATE 및 ALTER 로직을 모두 제거합니다.
    pass

with app.app_context(): init_db()

STOCK_CACHE = {'KOSPI': {'time': None, 'data': None, 'date': None, 'source': ''}, 'KOSDAQ': {'time': None, 'data': None, 'date': None, 'source': ''}}
PRICE_CACHE = {'time': None, 'data': {}}
RANKING_CACHE = {'time': None, 'data': []}
TICKER_CACHE = {}

def get_latest_business_day():
    now = datetime.now(KST)
    if now.hour < 16: now = now - timedelta(days=1)
    for i in range(10):
        target = (now - timedelta(days=i)).strftime("%Y%m%d")
        try:
            if stock.get_market_ticker_list(target, market="KOSPI"): return target
        except: continue
    return datetime.now(KST).strftime("%Y%m%d")

def get_top_stocks(market="KOSPI"):
    global STOCK_CACHE
    now = datetime.now(KST)
    cache = STOCK_CACHE.get(market, {'time': None, 'data': None, 'date': None, 'source': ''})
    if cache['time'] and (now.replace(tzinfo=None) - cache['time']).seconds < 600: return cache['data'], cache['date'], cache['source']
    
    result = {'gainers': [], 'losers': []}
    target_date_str = ""
    data_source = "KRX (pykrx)"
    try:
        target_date = get_latest_business_day()
        target_date_str = f"{target_date[:4]}.{target_date[4:6]}.{target_date[6:]}"
        df = stock.get_market_price_change_by_ticker(target_date, target_date)
        tickers = stock.get_market_ticker_list(target_date, market=market)
        df = df[df.index.isin(tickers)]
        top10_df = df.sort_values(by="등락률", ascending=False).head(10)
        bottom10_df = df.sort_values(by="등락률", ascending=True).head(10)
        for ticker, row in top10_df.iterrows(): result['gainers'].append({'code': ticker, 'name': stock.get_market_ticker_name(ticker), 'price': int(row['종가']), 'change_rate': float(row['등락률'])})
        for ticker, row in bottom10_df.iterrows(): result['losers'].append({'code': ticker, 'name': stock.get_market_ticker_name(ticker), 'price': int(row['종가']), 'change_rate': float(row['등락률'])})
    except Exception as e:
        data_source = "FinanceDataReader"
        try:
            import FinanceDataReader as fdr
            df_fdr = fdr.StockListing(market)
            top10_df = df_fdr.sort_values(by="ChagesRatio", ascending=False).head(10)
            bottom10_df = df_fdr.sort_values(by="ChagesRatio", ascending=True).head(10)
            target_date_str = now.strftime("%Y.%m.%d")
            for _, row in top10_df.iterrows(): result['gainers'].append({'code': str(row['Code']), 'name': str(row['Name']), 'price': int(row['Close']), 'change_rate': float(row['ChagesRatio'])})
            for _, row in bottom10_df.iterrows(): result['losers'].append({'code': str(row['Code']), 'name': str(row['Name']), 'price': int(row['Close']), 'change_rate': float(row['ChagesRatio'])})
        except Exception: data_source = "데이터 불러오기 실패"
    STOCK_CACHE[market] = {'time': now.replace(tzinfo=None), 'data': result, 'date': target_date_str, 'source': data_source}
    return result, target_date_str, data_source

def get_rankings():
    global RANKING_CACHE
    now = datetime.now()
    if RANKING_CACHE['time'] and (now - RANKING_CACHE['time']).seconds < 1800: return RANKING_CACHE['data']
    db = get_db()
    users = db.execute('SELECT ID, NAME, CASH_BALANCE, CREATED_AT FROM USERS').fetchall()
    holdings = db.execute('SELECT USER_ID, STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY FROM HOLDINGS').fetchall()
    real_time_prices = {}
    user_holdings = {}
    for h in holdings:
        if h['USER_ID'] not in user_holdings: user_holdings[h['USER_ID']] = []
        user_holdings[h['USER_ID']].append(h)
    ranking_list = []
    for u in users:
        total_asset = u['CASH_BALANCE']
        top_stocks = []
        if u['ID'] in user_holdings:
            for h in user_holdings[u['ID']]:
                code = h['STOCK_CODE']
                if code not in real_time_prices:
                    price = get_single_stock_price(code)
                    real_time_prices[code] = price if price is not None else h['AVG_PRICE']
                current_price = real_time_prices[code]
                total_asset += current_price * h['QUANTITY']
                profit = (current_price - h['AVG_PRICE']) * h['QUANTITY']
                profit_rate = ((current_price - h['AVG_PRICE']) / h['AVG_PRICE']) * 100 if h['AVG_PRICE'] > 0 else 0
                top_stocks.append({'name': h['STOCK_NAME'], 'profit_rate': profit_rate, 'profit': profit})
        top_stocks.sort(key=lambda x: x['profit_rate'], reverse=True)
        best_stock_name = f"{top_stocks[0]['name']} ({top_stocks[0]['profit_rate']:+.1f}%)" if top_stocks else "보유종목 없음"
        return_rate = ((total_asset - 50000000) / 50000000) * 100
        created_date = datetime.strptime(u['CREATED_AT'], '%Y-%m-%d %H:%M:%S').strftime('%Y.%m.%d') if isinstance(u['CREATED_AT'], str) else u['CREATED_AT'].strftime('%Y.%m.%d')
        ranking_list.append({'name': u['NAME'], 'total_asset': total_asset, 'return_rate': return_rate, 'best_stock': best_stock_name, 'created_date': created_date, 'top_5_stocks': top_stocks[:5]})
    ranking_list.sort(key=lambda x: x['total_asset'], reverse=True)
    top_10 = ranking_list[:10]
    RANKING_CACHE['time'] = now
    RANKING_CACHE['data'] = top_10
    return top_10

def init_tickers():
    global TICKER_CACHE
    if not TICKER_CACHE:
        try:
            import FinanceDataReader as fdr
            for _, row in fdr.StockListing('KRX').iterrows(): TICKER_CACHE[str(row['Code'])] = str(row['Name'])
            for _, row in fdr.StockListing('ETF/KR').iterrows(): TICKER_CACHE[str(row.get('Symbol', row.get('Code')))] = str(row['Name'])
        except: pass

def check_ai_limit(user_id):
    db = get_db()
    try: user = db.execute('SELECT DAILY_AI_COUNT, LAST_AI_REQUEST, AI_RESET_DATE FROM USERS WHERE ID = ?', (user_id,)).fetchone()
    except Exception as e: return False, "데이터베이스 오류"
    if not user: return False, "사용자를 찾을 수 없습니다."
    
    now_ts = time.time()
    today_str = datetime.now(KST).strftime('%Y-%m-%d')
    last_req = user['LAST_AI_REQUEST'] or 0
    daily_count = user['DAILY_AI_COUNT'] or 0
    reset_date = user['AI_RESET_DATE'] or ''
    
    if now_ts - last_req < 3: return False, "요청이 너무 빠릅니다. 3초 후 다시 시도해주세요."
    if reset_date != today_str:
        daily_count = 0
        reset_date = today_str
    if daily_count >= 100: return False, "1일 AI 사용량(100회)을 모두 소진했습니다. 내일 다시 이용해주세요."
        
    db.execute('UPDATE USERS SET LAST_AI_REQUEST = ?, DAILY_AI_COUNT = ?, AI_RESET_DATE = ? WHERE ID = ?', (now_ts, daily_count + 1, reset_date, user_id))
    db.commit()
    return True, ""


# ==========================================
# 라우팅 (Pages)
# ==========================================

@app.route('/')
def index():
    db = get_db()
    main_text_row = db.execute('SELECT MESSAGE FROM ANNOUNCEMENT WHERE ID = 2').fetchone()
    bg_mode_row = db.execute('SELECT MESSAGE FROM ANNOUNCEMENT WHERE ID = 5').fetchone()
    
    # CSS 요소를 배제하고 순수 텍스트 기본값으로 변경
    main_text = main_text_row['MESSAGE'] if main_text_row and main_text_row['MESSAGE'] else '세계적인 암전문 기관의 새로운 도전!\nNCC STOCK'
    bg_mode = bg_mode_row['MESSAGE'] if bg_mode_row else 'random'
    
    return render_template('index.html', main_text=main_text, bg_mode=bg_mode)

@app.route('/', methods=['POST'])
def login_post():
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE USERNAME = ?', (request.form.get('username'),)).fetchone()
    if user and check_password_hash(user['PASSWORD_HASH'], request.form.get('password')):
        session['user_id'], session['name'], session['username'] = user['ID'], user['NAME'], user['USERNAME']
        return redirect(url_for('dashboard'))
    flash('아이디 또는 비밀번호 오류입니다.')
    return redirect(url_for('index'))

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    db = get_db()
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        name = request.form.get('name', '').strip()
        password = request.form.get('password', '').strip()
        if not username or not name or not password:
            flash('모든 항목을 입력해주세요.')
            return redirect(url_for('signup'))
        if db.execute('SELECT * FROM USERS WHERE USERNAME = ? OR NAME = ?', (username, name)).fetchone():
            flash('❌ 이미 사용 중인 아이디 또는 닉네임입니다.')
            return redirect(url_for('signup'))
        try:
            db.execute('INSERT INTO USERS (USERNAME, PASSWORD_HASH, NAME) VALUES (?, ?, ?)', (username, generate_password_hash(password), name))
            db.commit()
            flash('✅ 회원가입 완료! 5,000만 원 지급됨.')
            return redirect(url_for('index'))
        except Exception: flash('❌ 회원가입 중 오류가 발생했습니다.')
        
    bg_mode_row = db.execute('SELECT MESSAGE FROM ANNOUNCEMENT WHERE ID = 5').fetchone()
    bg_mode = bg_mode_row['MESSAGE'] if bg_mode_row else 'random'
    return render_template('signup.html', bg_mode=bg_mode)

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone()
    holdings = db.execute('SELECT * FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall()
    total_stock_value = sum((get_single_stock_price(h['STOCK_CODE']) or h['AVG_PRICE']) * h['QUANTITY'] for h in holdings)
    total_asset = user['CASH_BALANCE'] + total_stock_value
    top_stocks, target_date_str, data_source = get_top_stocks("KOSPI")
    notice = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 1').fetchone()
    return render_template('dashboard.html', user=user, total_asset=total_asset, top_stocks=top_stocks, target_date=target_date_str, notice=notice, source=data_source)

@app.route('/trade')
def trade():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone()
    my_stocks = db.execute('SELECT STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall()
    return render_template('trade.html', user=user, my_stocks=my_stocks)

@app.route('/portfolio')
def portfolio():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone()
    holdings = db.execute('SELECT * FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall()
    portfolio_data, total_stock_value = [], 0
    for h in holdings:
        curr_price = get_single_stock_price(h['STOCK_CODE']) or h['AVG_PRICE']
        profit = (curr_price - h['AVG_PRICE']) * h['QUANTITY']
        profit_rate = ((curr_price - h['AVG_PRICE']) / h['AVG_PRICE']) * 100 if h['AVG_PRICE'] > 0 else 0
        value = curr_price * h['QUANTITY']
        total_stock_value += value
        portfolio_data.append({'code': h['STOCK_CODE'], 'name': h['STOCK_NAME'], 'qty': h['QUANTITY'], 'avg_price': h['AVG_PRICE'], 'curr_price': curr_price, 'profit': profit, 'profit_rate': profit_rate, 'value': value})
    total_asset = user['CASH_BALANCE'] + total_stock_value
    update_time = datetime.now(KST).strftime('%Y.%m.%d %H:%M:%S')
    return render_template('portfolio.html', user=user, portfolio_data=portfolio_data, total_asset=total_asset, stock_value=total_stock_value, update_time=update_time)

@app.route('/ranking')
def ranking():
    if 'user_id' not in session: return redirect(url_for('index'))
    return render_template('ranking.html', top_10_users=get_rankings())

@app.route('/simulation')
def simulation():
    if 'user_id' not in session: return redirect(url_for('index'))
    return render_template('simulation.html')

@app.route('/ai')
def ai_page():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    q1 = db.execute('SELECT MESSAGE FROM ANNOUNCEMENT WHERE ID = 3').fetchone()
    q2 = db.execute('SELECT MESSAGE FROM ANNOUNCEMENT WHERE ID = 4').fetchone()
    rec_q1 = q1['MESSAGE'] if q1 and q1['MESSAGE'] else '최근 삼성전자의 하락 요인과 반등 가능성에 대해 분석해줘.'
    rec_q2 = q2['MESSAGE'] if q2 and q2['MESSAGE'] else '가치투자 관점에서 워런 버핏이라면 현재 한국 시장에서 어떤 기준의 주식을 살까?'
    return render_template('ai.html', rec_q1=rec_q1, rec_q2=rec_q2)

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if session.get('username') != 'admin': return redirect(url_for('dashboard'))
    db = get_db()
    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'reset_pw':
            target = request.form.get('target_user')
            db.execute('UPDATE USERS SET PASSWORD_HASH = ? WHERE USERNAME = ?', (generate_password_hash('0000'), target))
            flash(f"✅ [{target}] 비밀번호 0000 초기화 완료.")
        elif action == 'update_notice':
            msg = request.form.get('message', '')[:100]
            is_active = 1 if request.form.get('is_active') == 'on' else 0
            db.execute('INSERT OR REPLACE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (1, ?, ?)', (msg, is_active))
            flash("✅ 공지사항 업데이트 완료.")
        elif action == 'update_main_text':
            msg = request.form.get('main_text', '')
            db.execute('INSERT OR REPLACE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (2, ?, 1)', (msg,))
            flash("✅ 메인 화면 문구 업데이트 완료.")
        elif action == 'update_bg_mode':
            mode = request.form.get('bg_mode', 'random')
            db.execute('INSERT OR REPLACE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (5, ?, 1)', (mode,))
            flash("✅ 메인 화면 배경 설정 완료.")
        elif action == 'update_ai_questions':
            q1 = request.form.get('rec_q1', '')[:100]
            q2 = request.form.get('rec_q2', '')[:100]
            db.execute('INSERT OR REPLACE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (3, ?, 1)', (q1,))
            db.execute('INSERT OR REPLACE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (4, ?, 1)', (q2,))
            flash("✅ AI 추천 질문이 업데이트 되었습니다.")
        elif action == 'reset_chat':
            db.execute('DELETE FROM CHAT')
            CHAT_BANS.clear()
            CHAT_HISTORY.clear()
            flash("✅ 미니 채팅방 내역 전체 초기화 완료.")
        elif action == 'refresh_ranking':
            global RANKING_CACHE
            RANKING_CACHE['time'] = None 
            get_rankings()
            flash("✅ 투자자 랭킹 즉시 갱신 완료.")
        elif action == 'reset_ai_limit':
            target = request.form.get('target_user')
            db.execute('UPDATE USERS SET DAILY_AI_COUNT = 0 WHERE USERNAME = ?', (target,))
            flash(f"✅ [{target}] AI 일일 사용량 초기화 완료.")
        db.commit()
            
    users = db.execute('SELECT * FROM USERS ORDER BY CREATED_AT DESC').fetchall()
    notice = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 1').fetchone()
    main_text_row = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 2').fetchone()
    q1_row = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 3').fetchone()
    q2_row = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 4').fetchone()
    bg_mode_row = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 5').fetchone()
    return render_template('admin.html', users=users, notice=notice, main_text=main_text_row, q1=q1_row, q2=q2_row, bg_mode=bg_mode_row)
	
@app.route('/game')
def game():
    # 로그인이 되어있지 않으면 메인 화면으로 돌려보냅니다.
    if 'user_id' not in session: 
        return redirect(url_for('index'))
    
    # 세션에서 사용자 이름을 가져와 게임 화면으로 전달합니다.
    username = session.get('name', '투자자')
    return render_template('game.html', username=username)
	
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))


# ==========================================
# API 엔드포인트
# ==========================================

@app.route('/api/search')
def api_search():
    init_tickers()
    keyword = request.args.get('q', '').strip()
    if not keyword: return {"results": []}
    results = [{"code": c, "name": n} for c, n in TICKER_CACHE.items() if keyword in n or keyword in c]
    return {"results": results[:10]}

@app.route('/api/stock_info/<code>')
def api_stock_info(code):
    init_tickers() 
    now = datetime.now(KST)
    start_date = (now - timedelta(days=45)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    chart_data, cp, pp, data_source = [], 0, 0, "KRX (pykrx)"
    try:
        df = stock.get_market_ohlcv(start_date.replace('-',''), end_date.replace('-',''), code)
        if df.empty: raise Exception()
        for index, row in df.iterrows(): chart_data.append({"time": index.strftime("%Y-%m-%d"), "open": int(row['시가']), "high": int(row['고가']), "low": int(row['저가']), "close": int(row['종가'])})
        cp, pp = int(df.iloc[-1]['종가']), int(df.iloc[-2]['종가'] if len(df) > 1 else df.iloc[-1]['종가'])
    except:
        try:
            data_source = "FinanceDataReader"
            import FinanceDataReader as fdr
            df = fdr.DataReader(code, start_date, end_date)
            for index, row in df.iterrows(): chart_data.append({"time": index.strftime("%Y-%m-%d"), "open": int(row['Open']), "high": int(row['High']), "low": int(row['Low']), "close": int(row['Close'])})
            cp, pp = int(df.iloc[-1]['Close']), int(df.iloc[-2]['Close'] if len(df) > 1 else df.iloc[-1]['Close'])
        except Exception: return {"error": "데이터를 찾을 수 없습니다."}, 404
    change_rate = ((cp - pp) / pp) * 100 if pp > 0 else 0
    return {"code": code, "name": TICKER_CACHE.get(code, code), "current_price": cp, "change_price": cp - pp, "change_rate": round(change_rate, 2), "chart_data": chart_data, "source": data_source}

@app.route('/api/news/<code>')
def api_news(code):
    return {"news": get_stock_news_scraped(code), "updated_at": datetime.now(KST).strftime("%Y.%m.%d %H:%M"), "source": "네이버 금융 실시간 뉴스"}

@app.route('/api/order', methods=['POST'])
def api_order():
    if 'user_id' not in session: return {"error": "로그인이 필요합니다.", "success": False}, 401
    user_id = session['user_id']
    now_ts = time.time()
    if now_ts - LAST_ORDER_TIME.get(user_id, 0) < 1.5: return {"error": "주문이 너무 빠릅니다. 1.5초 후 다시 시도해주세요.", "success": False}, 429
    LAST_ORDER_TIME[user_id] = now_ts

    data = request.json
    code, name, tx_type, qty, price = data.get('code'), data.get('name'), data.get('type'), int(data.get('qty', 0)), int(data.get('price', 0))
    if qty <= 0 or price <= 0: return {"error": "올바른 수량/가격이 아닙니다.", "success": False}
    is_regular_market = is_market_open()
    if tx_type == 'SELL' and not is_regular_market: return {"error": "장 마감 이후에는 매도가 불가능합니다.", "success": False}

    stock_amount = qty * price
    if tx_type == 'BUY':
        fee = int(stock_amount * (0.00015 if is_regular_market else 0.00030))
        total_amount = stock_amount + fee
    else:
        fee = int(stock_amount * 0.0020)
        total_amount = stock_amount - fee 

    db = get_db()
    try:
        cursor = db.cursor()
        user = cursor.execute('SELECT CASH_BALANCE FROM USERS WHERE ID = ?', (user_id,)).fetchone()
        holding = cursor.execute('SELECT ID, AVG_PRICE, QUANTITY FROM HOLDINGS WHERE USER_ID = ? AND STOCK_CODE = ?', (user_id, code)).fetchone()
        
        if tx_type == 'BUY':
            if user['CASH_BALANCE'] < total_amount: return {"error": "자본금이 부족합니다.", "success": False}
            cursor.execute('UPDATE USERS SET CASH_BALANCE = CASH_BALANCE - ? WHERE ID = ?', (total_amount, user_id))
            if holding: cursor.execute('UPDATE HOLDINGS SET QUANTITY = ?, AVG_PRICE = ? WHERE ID = ?', (holding['QUANTITY'] + qty, int(((holding['AVG_PRICE'] * holding['QUANTITY']) + stock_amount) / (holding['QUANTITY'] + qty)), holding['ID']))
            else: cursor.execute('INSERT INTO HOLDINGS (USER_ID, STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY) VALUES (?, ?, ?, ?, ?)', (user_id, code, name, int(stock_amount/qty), qty))
        else:
            if not holding or holding['QUANTITY'] < qty: return {"error": "보유 수량이 부족합니다.", "success": False}
            cursor.execute('UPDATE USERS SET CASH_BALANCE = CASH_BALANCE + ? WHERE ID = ?', (total_amount, user_id))
            if holding['QUANTITY'] == qty: cursor.execute('DELETE FROM HOLDINGS WHERE ID = ?', (holding['ID'],))
            else: cursor.execute('UPDATE HOLDINGS SET QUANTITY = QUANTITY - ? WHERE ID = ?', (qty, holding['ID']))
            
        cursor.execute('INSERT INTO TRANSACTIONS (USER_ID, STOCK_CODE, TX_TYPE, PRICE, QUANTITY, FEE) VALUES (?, ?, ?, ?, ?, ?)', (user_id, code, tx_type, price, qty, fee))
        db.commit()
        return {"success": True, "message": f"{name} {qty}주 {tx_type} 완료\n(수수료 {fee:,}원)", "new_balance": db.execute('SELECT CASH_BALANCE FROM USERS WHERE ID = ?', (user_id,)).fetchone()['CASH_BALANCE']}
    except Exception as e:
        db.rollback()
        return {"error": f"주문 처리 중 오류 발생: {str(e)}", "success": False}

@app.route('/api/market_trend/<market>')
def api_market_trend(market):
    data, date_str, source = get_top_stocks(market)
    return {"data": data, "date": date_str, "source": source}

@app.route('/api/comments/<code>', methods=['GET', 'POST'])
def api_comments(code):
    db = get_db()
    if request.method == 'POST':
        if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
        msg = request.json.get('message', '').strip()[:200]
        if msg:
            user_id = session['user_id']
            holding = db.execute('SELECT AVG_PRICE FROM HOLDINGS WHERE USER_ID = ? AND STOCK_CODE = ?', (user_id, code)).fetchone()
            curr_price = get_single_stock_price(code)
            ret_rate = 0
            if holding and holding['AVG_PRICE'] > 0 and curr_price:
                ret_rate = ((curr_price - holding['AVG_PRICE']) / holding['AVG_PRICE']) * 100
                
            db.execute('INSERT INTO COMMENTS (STOCK_CODE, USER_ID, MESSAGE, CREATED_AT, RETURN_RATE) VALUES (?, ?, ?, ?, ?)', (code, user_id, msg, datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S'), ret_rate))
            db.commit()
            return {"success": True}
        return {"error": "내용을 입력하세요."}, 400
    
    comments = db.execute('SELECT C.ID as CID, C.MESSAGE, C.CREATED_AT, C.RETURN_RATE, U.NAME, U.ID as UID FROM COMMENTS C JOIN USERS U ON C.USER_ID = U.ID WHERE C.STOCK_CODE = ? ORDER BY C.CREATED_AT DESC LIMIT 50', (code,)).fetchall()
    
    result = []
    for c in comments:
        holding = db.execute('SELECT AVG_PRICE FROM HOLDINGS WHERE USER_ID = ? AND STOCK_CODE = ?', (c['UID'], code)).fetchone()
        try: ret_rate = c['RETURN_RATE'] if c['RETURN_RATE'] is not None else 0
        except: ret_rate = 0
            
        dt_str = str(c['CREATED_AT'])
        time_formatted = dt_str[5:16].replace('-', '.') if len(dt_str) >= 16 else dt_str
        
        result.append({"id": c['CID'], "name": c['NAME'], "message": c['MESSAGE'], "time": time_formatted, "is_holder": holding is not None, "return_rate": round(ret_rate, 1)})
    return {"comments": result}

@app.route('/api/admin/comment', methods=['POST'])
def api_admin_comment():
    if session.get('username') != 'admin': return {"error": "권한이 없습니다."}, 403
    db = get_db()
    data = request.json
    if data.get('action') == 'delete': db.execute('DELETE FROM COMMENTS WHERE ID = ?', (data.get('id'),))
    elif data.get('action') == 'edit': db.execute('UPDATE COMMENTS SET MESSAGE = ? WHERE ID = ?', (data.get('message', '').strip()[:200], data.get('id')))
    db.commit()
    return {"success": True}

@app.route('/api/chat', methods=['GET', 'POST'])
def api_chat():
    db = get_db()
    if request.method == 'POST':
        if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
        user_id = session['user_id']
        now_ts = time.time()
        if user_id in CHAT_BANS and now_ts < CHAT_BANS[user_id]: return {"error": "도배 방지로 인해 채팅이 1분간 금지되었습니다."}, 403
        history = [t for t in CHAT_HISTORY.get(user_id, []) if now_ts - t < 5] 
        if len(history) >= 3:
            CHAT_BANS[user_id] = now_ts + 60
            return {"error": "도배 방지로 인해 채팅이 1분간 금지되었습니다."}, 403
        history.append(now_ts)
        CHAT_HISTORY[user_id] = history
        msg = request.json.get('message', '').strip()[:100]
        if msg:
            db.execute('INSERT INTO CHAT (USER_ID, MESSAGE, CREATED_AT) VALUES (?, ?, ?)', (user_id, msg, datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')))
            db.commit()
            return {"success": True}
        return {"error": "내용을 입력하세요."}, 400
    db.execute('DELETE FROM CHAT WHERE CREATED_AT < ?', ((datetime.now(KST) - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S"),))
    db.commit()
    chats = db.execute('SELECT C.MESSAGE, C.CREATED_AT, U.NAME FROM CHAT C JOIN USERS U ON C.USER_ID = U.ID ORDER BY C.CREATED_AT DESC LIMIT 30').fetchall()
    return {"chats": [{"name": c['NAME'], "message": c['MESSAGE'], "time": c['CREATED_AT'].split(' ')[1][:5]} for c in chats][::-1]}

@app.route('/api/simulation_run', methods=['POST'])
def api_simulation_run():
    data = request.json
    code, amount, months, mode = data.get('code'), int(data.get('amount')), int(data.get('months')), data.get('mode') 
    now = datetime.now()
    try:
        import FinanceDataReader as fdr
        df = fdr.DataReader(code, (now - timedelta(days=months*30)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d"))
        if df.empty: return {"error": "과거 주가 데이터가 없습니다."}, 404
        past_price, curr_price = int(df.iloc[0]['Close']), int(df.iloc[-1]['Close'])
        total_invested = amount if mode == 'lump' else amount * months
        stock_final = (total_invested // past_price) * curr_price + (total_invested % past_price)
        if mode == 'lump':
            ksema_final = total_invested * ((1 + 0.05) ** (months / 12))
            ksema_lump_final = total_invested * ((1 + 0.03) ** (months / 12))
        else:
            r5, r3 = 0.05 / 12, 0.03 / 12
            ksema_final = amount * (((1 + r5)**months - 1) / r5) * (1 + r5)
            ksema_lump_final = amount * (((1 + r3)**months - 1) / r3) * (1 + r3)
        return {"success": True, "invested": total_invested, "stock_name": TICKER_CACHE.get(code, code), "stock_final": int(stock_final), "stock_rate": round(((stock_final - total_invested) / total_invested) * 100, 1), "ksema_final": int(ksema_final), "ksema_lump_final": int(ksema_lump_final)}
    except Exception as e: return {"error": f"시뮬레이션 처리 중 오류: {e}"}, 500


# ==========================================
# AI 연동 API (Gemini 2.5 Flash & NVIDIA 듀얼)
# ==========================================

@app.route('/api/ai/chat', methods=['POST'])
def api_ai_chat():
    if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
    is_ok, msg = check_ai_limit(session['user_id'])
    if not is_ok: return {"error": msg}, 429
    
    data = request.json
    messages = data.get('messages', [])
    vendor = data.get('vendor', 'gemini') # 'gemini' or 'text'
    if not messages: return {"error": "메시지가 제공되지 않았습니다."}, 400
    
    last_user_msg = ""
    for m in reversed(messages):
        if m.get('role') == 'user':
            last_user_msg = m.get('content', '')[:500]
            break
            
    if last_user_msg:
        db = get_db()
        db.execute('INSERT INTO AI_LOGS (USER_ID, PROMPT, CREATED_AT) VALUES (?, ?, ?)', (session['user_id'], last_user_msg, datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')))
        db.execute('''DELETE FROM AI_LOGS WHERE ID NOT IN (SELECT ID FROM AI_LOGS ORDER BY ID DESC LIMIT 200)''')
        db.commit()
    
    if vendor == 'gemini':
        # Gemini 2.5 Flash 호출
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        contents = []
        for m in messages:
            role = "user" if m["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})
        payload = {"contents": contents}
        try:
            res = requests.post(url, json=payload, timeout=90)
            res.raise_for_status()
            reply = res.json()['candidates'][0]['content']['parts'][0]['text']
            return {"reply": reply, "model": "Gemini 2.5 Flash"}
        except Exception as e: return {"error": f"Gemini API 오류: {str(e)}"}, 500
        
    else:
        # NVIDIA Llama 모델 호출
        headers = {"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"}
        payload = {"model": "meta/llama-3.3-70b-instruct", "messages": messages, "temperature": 0.5, "max_tokens": 1024}
        try:
            res = requests.post("https://integrate.api.nvidia.com/v1/chat/completions", headers=headers, json=payload, timeout=90)
            res.raise_for_status()
            return {"reply": res.json()['choices'][0]['message']['content'], "model": "Llama-3.3-70B"}
        except Exception as e: return {"error": f"NVIDIA 서버 통신 오류: {str(e)}"}, 500

@app.route('/api/ai/image', methods=['POST'])
def api_ai_image():
    if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
    is_ok, msg = check_ai_limit(session['user_id'])
    if not is_ok: return {"error": msg}, 429
    prompt = request.json.get('prompt', '')
    if not prompt: return {"error": "프롬프트를 입력해주세요."}, 400
    
    db = get_db()
    db.execute('INSERT INTO AI_LOGS (USER_ID, PROMPT, CREATED_AT) VALUES (?, ?, ?)', (session['user_id'], f"[이미지 생성] {prompt[:500]}", datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')))
    db.commit()
    
    headers = {"Authorization": f"Bearer {NVIDIA_IMAGE_API_KEY}", "Accept": "application/json"}
    payload = {"prompt": prompt, "steps": 4}
    try:
        response = requests.post("https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell", headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        data = response.json()
        base64_data = ""
        if 'data' in data and len(data['data']) > 0 and 'b64_json' in data['data'][0]: base64_data = data['data'][0]['b64_json']
        elif 'artifacts' in data and len(data['artifacts']) > 0 and 'base64' in data['artifacts'][0]: base64_data = data['artifacts'][0]['base64']
        if not base64_data: return {"error": "이미지 생성에 실패했습니다."}, 500
        return {"b64_json": base64_data, "model": "Flux.1-schnell"}
    except Exception as e: return {"error": f"이미지 생성 서버 오류: {str(e)}"}, 500

@app.route('/api/ai/analyze_stock', methods=['POST'])
def api_ai_analyze_stock():
    if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
    is_ok, msg = check_ai_limit(session['user_id'])
    if not is_ok: return {"error": msg}, 429
    
    data = request.json
    news_text = "\n".join([f"- {n['title']} ({n['provider']})" for n in get_stock_news_scraped(data.get('code'))[:3]])
    prompt = f"당신은 NCS STOCK의 수석 주식 애널리스트입니다. 아래 실시간 종목 데이터를 바탕으로 한국어로 주식 전망을 300자 이내로 명쾌하고 논리적으로 요약해주세요.\n[데이터]\n종목명: {data.get('name')} ({data.get('code')})\n현재가: {data.get('price')}원\n등락률: {data.get('change_rate')}%\n[최근 이슈]\n{news_text}"
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    try:
        res = requests.post(url, json=payload, timeout=90)
        res.raise_for_status()
        reply = res.json()['candidates'][0]['content']['parts'][0]['text']
        return {"analysis": reply, "model": "Gemini 2.5 Flash"}
    except Exception: return {"error": "현재 AI 서버가 혼잡하여 실시간 전망을 가져올 수 없습니다. 잠시 후 새로고침 해보세요."}, 500

@app.route('/api/admin/ai_logs/<code>')
def api_admin_ai_logs(code):
    if session.get('username') != 'admin': return {"error": "권한이 없습니다."}, 403
    db = get_db()
    target_user = db.execute('SELECT ID, NAME FROM USERS WHERE USERNAME = ?', (code,)).fetchone()
    if not target_user: return {"error": "사용자를 찾을 수 없습니다."}, 404
    
    logs = db.execute('SELECT PROMPT, CREATED_AT FROM AI_LOGS WHERE USER_ID = ? ORDER BY CREATED_AT DESC LIMIT 20', (target_user['ID'],)).fetchall()
    return {
        "name": target_user['NAME'],
        "logs": [{"prompt": l['PROMPT'], "time": l['CREATED_AT']} for l in logs]
    }

if __name__ == '__main__':
    if not DATABASE_URL and not os.path.exists(DATABASE): init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)