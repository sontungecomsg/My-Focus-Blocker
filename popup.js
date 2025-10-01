document.addEventListener('DOMContentLoaded', async () => {
    const logContainer = document.getElementById('log-container');
    const loadingMessage = document.getElementById('loading-message');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        loadingMessage.textContent = 'Không có thông tin cho trang hiện tại.';
        return;
    }

    const currentTabUrl = new URL(tab.url);
    const getRootDomain = (h) => h ? h.split('.').slice(-2).join('.') : '';
    const currentTabDomain = getRootDomain(currentTabUrl.hostname);

    const { blockingLog = [] } = await chrome.storage.local.get("blockingLog");
    
    const relevantLogs = blockingLog.filter(item => {
        try {
            const initiatorDomain = getRootDomain(new URL(item.initiator).hostname);
            return initiatorDomain === currentTabDomain;
        } catch (e) { return false; }
    });
    
    loadingMessage.style.display = 'none';

    if (relevantLogs.length === 0) {
        logContainer.innerHTML = '<p id="empty-message">Không có yêu cầu nào bị chặn trên trang này.</p>';
        return;
    }

    relevantLogs.forEach(logItem => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'log-item';
        const urlSpan = document.createElement('span');
        urlSpan.className = 'log-url';
        urlSpan.textContent = logItem.url.length > 50 ? logItem.url.slice(0, 50) + '...' : logItem.url;
        urlSpan.title = logItem.url;
        const allowButton = document.createElement('button');
        allowButton.className = 'allow-btn';
        allowButton.textContent = 'Cho phép';
        allowButton.dataset.url = logItem.url;
        itemDiv.appendChild(urlSpan);
        itemDiv.appendChild(allowButton);
        logContainer.appendChild(itemDiv);
    });

    logContainer.addEventListener('click', async (event) => {
        if (event.target.classList.contains('allow-btn')) {
            const urlToWhitelist = event.target.dataset.url;
            const { whitelist = [] } = await chrome.storage.sync.get("whitelist");
            
            let simplifiedUrl = urlToWhitelist;
            try {
                const urlObj = new URL(urlToWhitelist);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                if (pathParts.length > 0) {
                    simplifiedUrl = `${urlObj.protocol}//${urlObj.hostname}/${pathParts[0]}/`;
                } else {
                    simplifiedUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
                }
            } catch(e) {}

            if (!whitelist.includes(simplifiedUrl)) {
                const newWhitelist = [...whitelist, simplifiedUrl];
                await chrome.storage.sync.set({ whitelist: newWhitelist });
                chrome.tabs.reload(tab.id);
                window.close();
            } else {
                alert('Quy tắc này đã có trong Whitelist.');
            }
        }
    });
});