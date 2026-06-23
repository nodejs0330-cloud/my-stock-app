import os
import sqlite3
import datetime
import time
from flask import Flask, render_template, request, session, redirect, url_for, g, flash
from werkzeug.security import generate_password_hash, check_password_hash
from pykrx import stock

app = Flask(__name__)
app.secret_key = os.urandom(24) 
DATABASE = 'database.db'

# --- 메모리 기반 보안 락 (따닥 방어 및 채팅 도배 방지) ---
LAST_ORDER_TIME = {}  
CHAT_HISTORY = {}     
CHAT_BANS = {}        

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row 
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS USERS (ID INTEGER PRIMARY KEY AUTOINCREMENT, USERNAME TEXT UNIQUE NOT NULL, PASSWORD_HASH TEXT NOT NULL, NAME TEXT NOT NULL, CASH_BALANCE INTEGER DEFAULT 50000000, CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS HOLDINGS (ID INTEGER PRIMARY KEY AUTOINCREMENT, USER_ID INTEGER, STOCK_CODE TEXT NOT NULL, STOCK_NAME TEXT NOT NULL, AVG_PRICE REAL NOT NULL, QUANTITY INTEGER NOT NULL, FOREIGN KEY(USER_ID) REFERENCES USERS(ID))''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS TRANSACTIONS (ID INTEGER PRIMARY KEY AUTOINCREMENT, USER_ID INTEGER, STOCK_CODE TEXT NOT NULL, TX_TYPE TEXT NOT NULL, PRICE REAL NOT NULL, QUANTITY INTEGER NOT NULL, FEE INTEGER DEFAULT 0, TX_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(USER_ID) REFERENCES USERS(ID))''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS WATCHLIST (ID INTEGER PRIMARY KEY AUTOINCREMENT, USER_ID INTEGER, STOCK_CODE TEXT NOT NULL, FOREIGN KEY(USER_ID) REFERENCES USERS(ID))''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS ANNOUNCEMENT (ID INTEGER PRIMARY KEY, MESSAGE TEXT, IS_ACTIVE INTEGER DEFAULT 0)''')
        cursor.execute('INSERT OR IGNORE INTO ANNOUNCEMENT (ID, MESSAGE, IS_ACTIVE) VALUES (1, "", 0)')
        
        cursor.execute('''CREATE TABLE IF NOT EXISTS COMMENTS (ID INTEGER PRIMARY KEY AUTOINCREMENT, STOCK_CODE TEXT NOT NULL, USER_ID INTEGER, MESSAGE TEXT, CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(USER_ID) REFERENCES USERS(ID))''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS CHAT (ID INTEGER PRIMARY KEY AUTOINCREMENT, USER_ID INTEGER, MESSAGE TEXT, CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(USER_ID) REFERENCES USERS(ID))''')
        
        db.commit()

# --- 데이터 수집 및 캐싱 (3차 방어선 적용) ---
STOCK_CACHE = {'KOSPI': {'time': None, 'data': None, 'date': None, 'source': ''}, 'KOSDAQ': {'time': None, 'data': None, 'date': None, 'source': ''}}
PRICE_CACHE = {'time': None, 'data': {}}
RANKING_CACHE = {'time': None, 'data': []}

def get_latest_business_day():
    now = datetime.datetime.now()
    if now.hour < 16: now = now - datetime.timedelta(days=1)
    for i in range(10):
        target = (now - datetime.timedelta(days=i)).strftime("%Y%m%d")
        try:
            tickers = stock.get_market_ticker_list(target, market="KOSPI")
            if tickers:
                df = stock.get_market_price_change_by_ticker(target, target)
                if not df.empty: return target
        except: continue
    return datetime.datetime.now().strftime("%Y%m%d")

def get_all_prices():
    global PRICE_CACHE
    now = datetime.datetime.now()
    if PRICE_CACHE['time'] and (now - PRICE_CACHE['time']).seconds < 1800: return PRICE_CACHE['data']
    try:
        import FinanceDataReader as fdr
        df_fdr = fdr.StockListing('KRX') 
        price_dict = dict(zip(df_fdr['Code'], df_fdr['Close']))
        PRICE_CACHE['time'] = now
        PRICE_CACHE['data'] = price_dict
        return price_dict
    except Exception as e:
        print(f"FDR 전체 가격 오류: {e}")
        return PRICE_CACHE['data']

def get_top_stocks(market="KOSPI"):
    global STOCK_CACHE
    now = datetime.datetime.now()
    cache = STOCK_CACHE.get(market, {'time': None, 'data': None, 'date': None, 'source': ''})
    if cache['time'] and (now - cache['time']).seconds < 600: return cache['data'], cache['date'], cache['source']
    
    result = {'gainers': [], 'losers': []}
    target_date_str = ""
    data_source = "KRX (pykrx)"
    
    try:
        target_date = get_latest_business_day()
        target_date_str = f"{target_date[:4]}.{target_date[4:6]}.{target_date[6:]}"
        df = stock.get_market_price_change_by_ticker(target_date, target_date)
        tickers = stock.get_market_ticker_list(target_date, market=market)
        df = df[df.index.isin(tickers)]
        if df.empty: raise Exception("pykrx empty")
        top10_df = df.sort_values(by="등락률", ascending=False).head(10)
        bottom10_df = df.sort_values(by="등락률", ascending=True).head(10)
        for ticker, row in top10_df.iterrows(): result['gainers'].append({'code': ticker, 'name': stock.get_market_ticker_name(ticker), 'price': int(row['종가']), 'change_rate': float(row['등락률']), 'change_price': int(row['대비'])})
        for ticker, row in bottom10_df.iterrows(): result['losers'].append({'code': ticker, 'name': stock.get_market_ticker_name(ticker), 'price': int(row['종가']), 'change_rate': float(row['등락률']), 'change_price': int(row['대비'])})
    except Exception as e:
        data_source = "FinanceDataReader"
        try:
            import FinanceDataReader as fdr
            df_fdr = fdr.StockListing(market)
            top10_df = df_fdr.sort_values(by="ChagesRatio", ascending=False).head(10)
            bottom10_df = df_fdr.sort_values(by="ChagesRatio", ascending=True).head(10)
            target_date_str = now.strftime("%Y.%m.%d")
            for _, row in top10_df.iterrows(): result['gainers'].append({'code': str(row['Code']), 'name': str(row['Name']), 'price': int(row['Close']), 'change_rate': float(row['ChagesRatio']), 'change_price': int(row['Changes'])})
            for _, row in bottom10_df.iterrows(): result['losers'].append({'code': str(row['Code']), 'name': str(row['Name']), 'price': int(row['Close']), 'change_rate': float(row['ChagesRatio']), 'change_price': int(row['Changes'])})
        except Exception as fallback_e:
            data_source = "데이터 불러오기 실패"

    STOCK_CACHE[market] = {'time': now, 'data': result, 'date': target_date_str, 'source': data_source}
    return result, target_date_str, data_source

def get_user_total_return(user_id):
    db = get_db()
    user = db.execute('SELECT CASH_BALANCE FROM USERS WHERE ID = ?', (user_id,)).fetchone()
    if not user: return 0
    holdings = db.execute('SELECT STOCK_CODE, QUANTITY FROM HOLDINGS WHERE USER_ID = ?', (user_id,)).fetchall()
    current_prices = get_all_prices()
    total_stock_value = sum([current_prices.get(h['STOCK_CODE'], 0) * h['QUANTITY'] for h in holdings])
    total_asset = user['CASH_BALANCE'] + total_stock_value
    return ((total_asset - 50000000) / 50000000) * 100

def get_rankings():
    global RANKING_CACHE
    now = datetime.datetime.now()
    if RANKING_CACHE['time'] and (now - RANKING_CACHE['time']).seconds < 1800: return RANKING_CACHE['data']
    db = get_db()
    users = db.execute('SELECT ID, NAME, CASH_BALANCE, CREATED_AT FROM USERS').fetchall()
    holdings = db.execute('SELECT USER_ID, STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY FROM HOLDINGS').fetchall()
    current_prices = get_all_prices()
    
    user_holdings = {}
    for h in holdings:
        if h['USER_ID'] not in user_holdings: user_holdings[h['USER_ID']] = []
        user_holdings[h['USER_ID']].append(h)
        
    ranking_list = []
    for u in users:
        total_asset = u['CASH_BALANCE']
        best_stock_name = "보유종목 없음"
        best_stock_profit = -float('inf')
        if u['ID'] in user_holdings:
            for h in user_holdings[u['ID']]:
                current_price = current_prices.get(h['STOCK_CODE'], h['AVG_PRICE'])
                total_asset += current_price * h['QUANTITY']
                profit = (current_price - h['AVG_PRICE']) * h['QUANTITY']
                if profit > best_stock_profit:
                    best_stock_profit = profit
                    profit_rate = ((current_price - h['AVG_PRICE']) / h['AVG_PRICE']) * 100 if h['AVG_PRICE'] > 0 else 0
                    best_stock_name = f"{h['STOCK_NAME']} ({profit_rate:+.1f}%)"
        return_rate = ((total_asset - 50000000) / 50000000) * 100
        created_date = datetime.datetime.strptime(u['CREATED_AT'], '%Y-%m-%d %H:%M:%S').strftime('%Y.%m.%d') if isinstance(u['CREATED_AT'], str) else u['CREATED_AT'].strftime('%Y.%m.%d')
        ranking_list.append({'name': u['NAME'], 'total_asset': total_asset, 'return_rate': return_rate, 'best_stock': best_stock_name, 'created_date': created_date})
        
    ranking_list.sort(key=lambda x: x['total_asset'], reverse=True)
    top_10 = ranking_list[:10]
    RANKING_CACHE['time'] = now
    RANKING_CACHE['data'] = top_10
    return top_10

TICKER_CACHE = {}
def init_tickers():
    global TICKER_CACHE
    if not TICKER_CACHE:
        try:
            import FinanceDataReader as fdr
            df = fdr.StockListing('KRX')
            for _, row in df.iterrows(): TICKER_CACHE[str(row['Code'])] = str(row['Name'])
        except: pass

# --- API 라우팅 ---
@app.route('/api/search')
def api_search():
    init_tickers()
    keyword = request.args.get('q', '').strip()
    if not keyword: return {"results": []}
    results = [{"code": c, "name": n} for c, n in TICKER_CACHE.items() if keyword in n or keyword in c]
    return {"results": results[:10]}

@app.route('/api/stock_info/<code>')
def api_stock_info(code):
    now = datetime.datetime.now()
    start_date = (now - datetime.timedelta(days=45)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    
    chart_data = []
    cp = pp = 0
    data_source = "KRX (pykrx)"
    
    try:
        df = stock.get_market_ohlcv(start_date.replace('-',''), end_date.replace('-',''), code)
        if df.empty: raise Exception()
        for index, row in df.iterrows():
            chart_data.append({"time": index.strftime("%Y-%m-%d"), "open": int(row['시가']), "high": int(row['고가']), "low": int(row['저가']), "close": int(row['종가'])})
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest
        cp, pp = int(latest['종가']), int(prev['종가'])
    except:
        try:
            data_source = "FinanceDataReader"
            import FinanceDataReader as fdr
            df = fdr.DataReader(code, start_date, end_date)
            if df.empty: raise Exception()
            for index, row in df.iterrows():
                chart_data.append({"time": index.strftime("%Y-%m-%d"), "open": int(row['Open']), "high": int(row['High']), "low": int(row['Low']), "close": int(row['Close'])})
            latest = df.iloc[-1]
            prev = df.iloc[-2] if len(df) > 1 else latest
            cp, pp = int(latest['Close']), int(prev['Close'])
        except:
            try:
                data_source = "Yahoo Finance"
                import yfinance as yf
                yf_code = f"{code}.KS" if not str(code).startswith('0') else f"{code}.KQ" 
                df = yf.download(yf_code, start=start_date, end=end_date, progress=False)
                if df.empty: raise Exception()
                for index, row in df.iterrows():
                    chart_data.append({"time": index.strftime("%Y-%m-%d"), "open": int(row['Open']), "high": int(row['High']), "low": int(row['Low']), "close": int(row['Close'])})
                latest = df.iloc[-1]
                prev = df.iloc[-2] if len(df) > 1 else latest
                cp, pp = int(latest['Close']), int(prev['Close'])
            except Exception as e:
                return {"error": "모든 API 원천에서 데이터를 찾을 수 없습니다."}, 404

    change_price = cp - pp
    change_rate = (change_price / pp) * 100 if pp > 0 else 0
    return {"code": code, "name": TICKER_CACHE.get(code, code), "current_price": cp, "change_price": change_price, "change_rate": round(change_rate, 2), "chart_data": chart_data, "source": data_source}

@app.route('/api/order', methods=['POST'])
def api_order():
    if 'user_id' not in session: return {"error": "로그인이 필요합니다.", "success": False}, 401
    user_id = session['user_id']
    now_ts = time.time()
    
    last_order = LAST_ORDER_TIME.get(user_id, 0)
    if now_ts - last_order < 1.5:
        return {"error": "주문이 너무 빠릅니다. 1.5초 후 다시 시도해 주세요.", "success": False}, 429
    LAST_ORDER_TIME[user_id] = now_ts

    data = request.json
    code, name, tx_type, qty, price = data.get('code'), data.get('name'), data.get('type'), int(data.get('qty', 0)), int(data.get('price', 0))
    if qty <= 0 or price <= 0: return {"error": "올바른 수량과 가격이 아닙니다.", "success": False}
        
    now = datetime.datetime.now()
    hour = now.getHours() if hasattr(now, 'getHours') else now.hour
    day = now.getDay() if hasattr(now, 'getDay') else now.weekday()
    is_regular_market = (day < 5 and 9 <= hour < 16) 
    
    if tx_type == 'SELL' and not is_regular_market:
        return {"error": "장 마감 이후에는 매도 주문이 불가능합니다.", "success": False}

    stock_amount = qty * price
    if tx_type == 'BUY':
        fee_rate = 0.00015 if is_regular_market else 0.00030
        fee = int(stock_amount * fee_rate)
        total_amount = stock_amount + fee
    else: 
        fee_rate = 0.0020
        fee = int(stock_amount * fee_rate)
        total_amount = stock_amount - fee 

    db = get_db()
    try:
        user = db.execute('SELECT * FROM USERS WHERE ID = ?', (user_id,)).fetchone()
        holding = db.execute('SELECT * FROM HOLDINGS WHERE USER_ID = ? AND STOCK_CODE = ?', (user_id, code)).fetchone()
        
        if tx_type == 'BUY':
            if user['CASH_BALANCE'] < total_amount: return {"error": f"자본금이 부족합니다. (수수료 {fee}원 포함 총 {total_amount}원 필요)", "success": False}
            db.execute('UPDATE USERS SET CASH_BALANCE = CASH_BALANCE - ? WHERE ID = ?', (total_amount, user_id))
            if holding:
                new_qty = holding['QUANTITY'] + qty
                new_avg = ((holding['AVG_PRICE'] * holding['QUANTITY']) + total_amount) / new_qty
                db.execute('UPDATE HOLDINGS SET QUANTITY = ?, AVG_PRICE = ? WHERE ID = ?', (new_qty, new_avg, holding['ID']))
            else:
                db.execute('INSERT INTO HOLDINGS (USER_ID, STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY) VALUES (?, ?, ?, ?, ?)', (user_id, code, name, total_amount/qty, qty))
        elif tx_type == 'SELL':
            if not holding or holding['QUANTITY'] < qty: return {"error": "보유 수량이 부족합니다.", "success": False}
            db.execute('UPDATE USERS SET CASH_BALANCE = CASH_BALANCE + ? WHERE ID = ?', (total_amount, user_id))
            if holding['QUANTITY'] == qty: db.execute('DELETE FROM HOLDINGS WHERE ID = ?', (holding['ID'],))
            else: db.execute('UPDATE HOLDINGS SET QUANTITY = QUANTITY - ? WHERE ID = ?', (qty, holding['ID']))
            
        db.execute('INSERT INTO TRANSACTIONS (USER_ID, STOCK_CODE, TX_TYPE, PRICE, QUANTITY, FEE) VALUES (?, ?, ?, ?, ?, ?)', (user_id, code, tx_type, price, qty, fee))
        db.commit()
        new_balance = db.execute('SELECT CASH_BALANCE FROM USERS WHERE ID = ?', (user_id,)).fetchone()['CASH_BALANCE']
        msg_extra = "특례 적용 (수수료 2배)" if (tx_type == 'BUY' and not is_regular_market) else ""
        return {"success": True, "message": f"{name} {qty}주 {tx_type} 완료\n(수수료 {fee}원) {msg_extra}", "new_balance": new_balance}
    except Exception as e:
        db.rollback()
        return {"error": "주문 처리 중 오류 발생.", "success": False}

@app.route('/api/market_trend/<market>')
def api_market_trend(market):
    if market not in ['KOSPI', 'KOSDAQ']: return {"error": "잘못된 시장"}
    data, date_str, source = get_top_stocks(market)
    return {"data": data, "date": date_str, "source": source}

@app.route('/api/comments/<code>', methods=['GET', 'POST'])
def api_comments(code):
    db = get_db()
    if request.method == 'POST':
        if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
        msg = request.json.get('message', '').strip()[:200]
        if msg:
            db.execute('INSERT INTO COMMENTS (STOCK_CODE, USER_ID, MESSAGE) VALUES (?, ?, ?)', (code, session['user_id'], msg))
            db.commit()
            return {"success": True}
        return {"error": "내용을 입력하세요."}, 400
        
    comments = db.execute('SELECT C.ID as CID, C.MESSAGE, C.CREATED_AT, U.NAME, U.ID as UID FROM COMMENTS C JOIN USERS U ON C.USER_ID = U.ID WHERE C.STOCK_CODE = ? ORDER BY C.CREATED_AT DESC LIMIT 50', (code,)).fetchall()
    result = []
    for c in comments:
        uid = c['UID']
        is_holder = db.execute('SELECT 1 FROM HOLDINGS WHERE USER_ID = ? AND STOCK_CODE = ?', (uid, code)).fetchone() is not None
        ret_rate = get_user_total_return(uid)
        result.append({"id": c['CID'], "name": c['NAME'], "message": c['MESSAGE'], "time": c['CREATED_AT'].split(' ')[1][:5], "is_holder": is_holder, "return_rate": round(ret_rate, 1)})
    return {"comments": result}

# --- 신규: 관리자 전용 종토방 댓글 관리 API ---
@app.route('/api/admin/comment', methods=['POST'])
def api_admin_comment():
    if session.get('username') != 'admin': return {"error": "권한이 없습니다."}, 403
    db = get_db()
    data = request.json
    action = data.get('action')
    comment_id = data.get('id')
    
    if action == 'delete':
        db.execute('DELETE FROM COMMENTS WHERE ID = ?', (comment_id,))
    elif action == 'edit':
        new_msg = data.get('message', '').strip()[:200]
        db.execute('UPDATE COMMENTS SET MESSAGE = ? WHERE ID = ?', (new_msg, comment_id))
    
    db.commit()
    return {"success": True}

@app.route('/api/chat', methods=['GET', 'POST'])
def api_chat():
    db = get_db()
    if request.method == 'POST':
        if 'user_id' not in session: return {"error": "로그인이 필요합니다."}, 401
        user_id = session['user_id']
        now_ts = time.time()
        
        if user_id in CHAT_BANS and now_ts < CHAT_BANS[user_id]:
            return {"error": "도배 방지로 인해 채팅이 1분간 금지되었습니다."}, 403
            
        history = CHAT_HISTORY.get(user_id, [])
        history = [t for t in history if now_ts - t < 5] 
        if len(history) >= 3:
            CHAT_BANS[user_id] = now_ts + 60
            return {"error": "도배 방지로 인해 채팅이 1분간 금지되었습니다."}, 403
            
        history.append(now_ts)
        CHAT_HISTORY[user_id] = history
        
        msg = request.json.get('message', '').strip()[:100]
        if msg:
            db.execute('INSERT INTO CHAT (USER_ID, MESSAGE) VALUES (?, ?)', (user_id, msg))
            db.commit()
            return {"success": True}
        return {"error": "내용을 입력하세요."}, 400

    seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute('DELETE FROM CHAT WHERE CREATED_AT < ?', (seven_days_ago,))
    db.commit()
    
    chats = db.execute('SELECT C.MESSAGE, C.CREATED_AT, U.NAME FROM CHAT C JOIN USERS U ON C.USER_ID = U.ID ORDER BY C.CREATED_AT DESC LIMIT 30').fetchall()
    return {"chats": [{"name": c['NAME'], "message": c['MESSAGE'], "time": c['CREATED_AT'].split(' ')[1][:5]} for c in chats][::-1]}

@app.route('/api/simulation_run', methods=['POST'])
def api_simulation_run():
    """과거 주가와 공제회 이율을 비교하는 로직"""
    data = request.json
    code, amount, months = data.get('code'), int(data.get('amount')), int(data.get('months'))
    mode = data.get('mode') 
    
    now = datetime.datetime.now()
    start_date = (now - datetime.timedelta(days=months*30)).strftime("%Y-%m-%d")
    
    try:
        import FinanceDataReader as fdr
        df = fdr.DataReader(code, start_date, now.strftime("%Y-%m-%d"))
        if df.empty: return {"error": "과거 주가 데이터가 없습니다."}, 404
        
        past_price = int(df.iloc[0]['Close'])
        curr_price = int(df.iloc[-1]['Close'])
        
        if mode == 'lump':
            total_invested = amount
            shares = amount // past_price
            stock_final = shares * curr_price + (amount % past_price)
        else: 
            total_invested = amount * months
            shares = total_invested // past_price
            stock_final = shares * curr_price + (total_invested % past_price)
            
        stock_rate = ((stock_final - total_invested) / total_invested) * 100
        
        # 공제회 적립형(5%) / 목돈급여(3%) 분리 계산
        if mode == 'lump':
            ksema_final = total_invested * ((1 + 0.05) ** (months / 12))
            ksema_lump_final = total_invested * ((1 + 0.03) ** (months / 12))
        else:
            r5 = 0.05 / 12
            ksema_final = amount * (((1 + r5)**months - 1) / r5) * (1 + r5)
            r3 = 0.03 / 12
            ksema_lump_final = amount * (((1 + r3)**months - 1) / r3) * (1 + r3)
            
        return {
            "success": True,
            "invested": total_invested,
            "stock_name": TICKER_CACHE.get(code, code),
            "stock_final": int(stock_final),
            "stock_rate": round(stock_rate, 1),
            "current_price": curr_price,
            "ksema_final": int(ksema_final),
            "ksema_lump_final": int(ksema_lump_final)
        }
    except Exception as e:
        return {"error": f"시뮬레이션 오류: {e}"}, 500

# --- 웹 페이지 라우팅 ---
@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        user = get_db().execute('SELECT * FROM USERS WHERE USERNAME = ?', (request.form.get('username'),)).fetchone()
        if user and check_password_hash(user['PASSWORD_HASH'], request.form.get('password')):
            session['user_id'], session['name'], session['username'] = user['ID'], user['NAME'], user['USERNAME']
            return redirect(url_for('dashboard'))
        flash('아이디 또는 비밀번호 오류입니다.')
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        db = get_db()
        try:
            db.execute('INSERT INTO USERS (USERNAME, PASSWORD_HASH, NAME) VALUES (?, ?, ?)', (request.form.get('username'), generate_password_hash(request.form.get('password')), request.form.get('name')))
            db.commit()
            flash('회원가입 완료! 5,000만 원 지급됨.')
            return redirect(url_for('index'))
        except: flash('이미 존재하는 아이디입니다.')
    return render_template('signup.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone()
    
    holdings = db.execute('SELECT * FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall()
    current_prices = get_all_prices()
    total_stock_value = sum([current_prices.get(h['STOCK_CODE'], h['AVG_PRICE']) * h['QUANTITY'] for h in holdings])
    total_asset = user['CASH_BALANCE'] + total_stock_value
    
    top_stocks, target_date_str, data_source = get_top_stocks("KOSPI")
    notice = db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 1').fetchone()
    
    return render_template('dashboard.html', user=user, total_asset=total_asset, top_stocks=top_stocks, target_date=target_date_str, notice=notice, source=data_source)

@app.route('/trade')
def trade():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    return render_template('trade.html', user=db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone(), my_stocks=db.execute('SELECT STOCK_CODE, STOCK_NAME, AVG_PRICE, QUANTITY FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall())

@app.route('/portfolio')
def portfolio():
    if 'user_id' not in session: return redirect(url_for('index'))
    db = get_db()
    user = db.execute('SELECT * FROM USERS WHERE ID = ?', (session['user_id'],)).fetchone()
    holdings = db.execute('SELECT * FROM HOLDINGS WHERE USER_ID = ?', (session['user_id'],)).fetchall()
    
    current_prices = get_all_prices()
    portfolio_data = []
    total_stock_value = 0
    for h in holdings:
        curr_price = current_prices.get(h['STOCK_CODE'], h['AVG_PRICE'])
        profit = (curr_price - h['AVG_PRICE']) * h['QUANTITY']
        profit_rate = ((curr_price - h['AVG_PRICE']) / h['AVG_PRICE']) * 100 if h['AVG_PRICE'] > 0 else 0
        value = curr_price * h['QUANTITY']
        total_stock_value += value
        portfolio_data.append({'code': h['STOCK_CODE'], 'name': h['STOCK_NAME'], 'qty': h['QUANTITY'], 'avg_price': h['AVG_PRICE'], 'curr_price': curr_price, 'profit': profit, 'profit_rate': profit_rate, 'value': value})
        
    total_asset = user['CASH_BALANCE'] + total_stock_value
    return render_template('portfolio.html', user=user, portfolio_data=portfolio_data, total_asset=total_asset, stock_value=total_stock_value)

@app.route('/ranking')
def ranking():
    if 'user_id' not in session: return redirect(url_for('index'))
    return render_template('ranking.html', top_10_users=get_rankings())

@app.route('/simulation')
def simulation():
    if 'user_id' not in session: return redirect(url_for('index'))
    return render_template('simulation.html')

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if session.get('username') != 'admin': return redirect(url_for('dashboard'))
    db = get_db()
    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'reset_pw':
            db.execute('UPDATE USERS SET PASSWORD_HASH = ? WHERE USERNAME = ?', (generate_password_hash('0000'), request.form.get('target_user')))
            db.commit()
            flash(f"✅ [{request.form.get('target_user')}] 비밀번호 초기화됨.")
        elif action == 'update_notice':
            db.execute('UPDATE ANNOUNCEMENT SET MESSAGE = ?, IS_ACTIVE = ? WHERE ID = 1', (request.form.get('message', '')[:100], 1 if request.form.get('is_active') == 'on' else 0))
            db.commit()
            flash("✅ 공지사항 업데이트 됨.")
        elif action == 'reset_chat':
            db.execute('DELETE FROM CHAT')
            db.commit()
            CHAT_BANS.clear()
            CHAT_HISTORY.clear()
            flash("✅ 미니 채팅방 내역 및 도배 밴 기록이 모두 초기화되었습니다.")
        elif action == 'refresh_ranking':
            global RANKING_CACHE
            RANKING_CACHE['time'] = None # 캐시 무효화로 다음 호출 시 강제 계산 유도
            get_rankings()
            flash("✅ 투자자 랭킹이 즉시 새로 계산되어 갱신되었습니다.")
    return render_template('admin.html', users=db.execute('SELECT * FROM USERS ORDER BY CREATED_AT DESC').fetchall(), notice=db.execute('SELECT * FROM ANNOUNCEMENT WHERE ID = 1').fetchone())

@app.route('/logout')
def logout(): session.clear(); return redirect(url_for('index'))

if __name__ == '__main__':
    if not os.path.exists(DATABASE): init_db()
    init_db() 
    app.run(host='0.0.0.0', port=5000, debug=True)