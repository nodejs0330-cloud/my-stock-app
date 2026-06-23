document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. 메인 로그인 폼 등장/숨김 애니메이션 로직 ---
    const showLoginBtn = document.getElementById('show-login-btn');
    const closeLoginBtn = document.getElementById('close-login-btn');
    const loginFormContainer = document.getElementById('login-form-container');
    const kitschText = document.getElementById('kitsch-text');

    if (showLoginBtn && loginFormContainer) {
        // 로그인 버튼 클릭 시 폼 보여주기
        showLoginBtn.addEventListener('click', () => {
            // 키치 텍스트 위로 올리고 흐리게 처리
            kitschText.classList.replace('justify-center', 'justify-start');
            kitschText.classList.add('mt-10', 'opacity-30', 'scale-75');
            kitschText.querySelector('button').classList.add('hidden'); // 중앙 버튼 숨김
            
            // 로그인 폼 부드럽게 등장
            loginFormContainer.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
            loginFormContainer.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        });

        // X 버튼 클릭 시 폼 숨기기
        closeLoginBtn.addEventListener('click', () => {
            // 로그인 폼 숨기기
            loginFormContainer.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
            loginFormContainer.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            
            // 키치 텍스트 원상복구
            kitschText.classList.replace('justify-start', 'justify-center');
            kitschText.classList.remove('mt-10', 'opacity-30', 'scale-75');
            kitschText.querySelector('button').classList.remove('hidden');
        });
    }

    // --- 2. 배경 전환 관련 요소 ---
    const bodyBg = document.getElementById('body-bg');
    const bgToggleBtn = document.getElementById('bg-toggle-btn');
    
    let isExternalBg = false;
    
    if (bgToggleBtn) {
        bgToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isExternalBg = !isExternalBg;
            
            if (isExternalBg) {
                const randomImageUrl = `https://picsum.photos/1920/1080?random=${new Date().getTime()}`;
                bodyBg.style.backgroundImage = `url('${randomImageUrl}')`;
                bodyBg.classList.remove('bg-default');
                bodyBg.classList.add('bg-external');
                
                bgToggleBtn.innerText = '🎨 원래 배경';
                bgToggleBtn.classList.replace('bg-indigo-600/80', 'bg-pink-600/80');
            } else {
                bodyBg.style.backgroundImage = '';
                bodyBg.classList.remove('bg-external');
                bodyBg.classList.add('bg-default');
                
                bgToggleBtn.innerText = '🌌 외부 배경';
                bgToggleBtn.classList.replace('bg-pink-600/80', 'bg-indigo-600/80');
            }
        });
    }

    // --- 3. QR 코드 관련 요소 ---
    const qrToggleBtn = document.getElementById('qr-toggle-btn');
    const qrModal = document.getElementById('qr-modal');
    const qrCloseBtn = document.getElementById('qr-close-btn');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrUrlText = document.getElementById('qr-url-text');

    if (qrToggleBtn && qrModal) {
        qrToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            qrModal.classList.remove('hidden');
            
            const currentUrl = window.location.href;
            qrUrlText.innerText = currentUrl;
            qrcodeContainer.innerHTML = '';
            
            new QRCode(qrcodeContainer, {
                text: currentUrl,
                width: 180,
                height: 180,
                colorDark : "#111827",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        });

        qrCloseBtn.addEventListener('click', () => {
            qrModal.classList.add('hidden');
        });
        
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) {
                qrModal.classList.add('hidden');
            }
        });
    }
});