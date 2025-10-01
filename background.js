// Hàm ghi lại nhật ký
async function logBlockedRequest(blockedUrl, initiatorUrl) {
    const { blockingLog = [] } = await chrome.storage.local.get("blockingLog");
    blockingLog.unshift({
        url: blockedUrl,
        initiator: initiatorUrl,
        timestamp: new Date().toISOString()
    });
    const trimmedLog = blockingLog.slice(0, 20);
    await chrome.storage.local.set({ blockingLog: trimmedLog });
}

// Listener chính cho việc chặn web
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Bỏ qua các yêu cầu không có tabId
        if (details.tabId === -1) return;

        chrome.storage.sync.get({ blockingRules: [], whitelist: [] }, (data) => {
            const { blockingRules, whitelist } = data;
            if (blockingRules.length === 0 && whitelist.length === 0) return;

            const requestUrlStr = details.url;
            
            // BƯỚC 1: KIỂM TRA WHITELIST (LOGIC NÂNG CẤP HỖ TRỢ REGEX)
            const isWhitelisted = whitelist.some(site => {
                if (site.startsWith('/') && site.endsWith('/')) {
                    try {
                        const pattern = site.slice(1, -1);
                        // Tự động vô hiệu hóa các dấu '/' bên trong quy tắc Regex
                        const escapedPattern = pattern.replace(/\//g, '\\/'); 
                        const regex = new RegExp(escapedPattern, 'i');
                        return regex.test(requestUrlStr);
                    } catch (e) { 
                        console.error("Invalid Regex in whitelist:", site, e);
                        return false; 
                    }
                } else {
                    // Nếu không phải Regex, dùng logic so sánh chuỗi thông thường
                    return requestUrlStr.includes(site);
                }
            });

            // Nếu nằm trong whitelist, cho phép truy cập ngay lập tức
            if (isWhitelisted) {
                return;
            }

            // BƯỚC 2: KIỂM TRA QUY TẮC CHẶN
            const requestUrl = new URL(requestUrlStr);
            const hostname = requestUrl.hostname;

            const matchingRules = blockingRules.filter(rule => {
                return hostname === rule.site || hostname === `www.${rule.site}`;
            });

            if (matchingRules.length === 0) return;
            
            // BƯỚC 3: KIỂM TRA NỘI DUNG NHÚNG (TRUY CẬP TRỰC TIẾP)
            const isThirdPartyRequest = () => {
                if (!details.documentUrl) return false;
                if (!details.documentUrl.startsWith('http')) return false;

                const documentHostname = new URL(details.documentUrl).hostname;
                const getRootDomain = (h) => h.split('.').slice(-2).join('.');
                return getRootDomain(hostname) !== getRootDomain(documentHostname);
            };

            if (isThirdPartyRequest()) {
                return;
            }

            // BƯỚC 4: NẾU LÀ TRUY CẬP TRỰC TIẾP, KIỂM TRA THỜI GIAN
            const now = new Date();
            const currentDay = now.getDay();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            const isBlockedByTime = matchingRules.some(rule => {
                const isDayMatch = rule.days.includes(currentDay);
                if (!isDayMatch) return false;
                const { startTime, endTime } = rule;
                let isTimeMatch = false;
                if (startTime < endTime) {
                    isTimeMatch = currentTime >= startTime && currentTime < endTime;
                } else {
                    isTimeMatch = currentTime >= startTime || currentTime < endTime;
                }
                return isTimeMatch;
            });

            if (isBlockedByTime) {
                logBlockedRequest(requestUrlStr, details.documentUrl || requestUrlStr);
                const blockerUrl = chrome.runtime.getURL("blocked.html") + `?blocked=${encodeURIComponent(requestUrlStr)}`;
                chrome.tabs.update(details.tabId, { url: blockerUrl });
            }
        });
    },
    { urls: ["<all_urls>"] }
);