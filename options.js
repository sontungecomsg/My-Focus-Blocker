// Dán URL Raw từ GitHub Gist của bạn vào đây
const MASTER_WHITELIST_URL = 'https://raw.githubusercontent.com/sontungecomsg/My-Focus-Blocker/refs/heads/main/whitelist.txt';

// Hàm mã hóa mật khẩu
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Xử lý logic hiển thị màn hình mật khẩu khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    const passwordScreen = document.getElementById('password-screen');
    const mainContent = document.getElementById('main-content');
    const setPasswordForm = document.getElementById('set-password-form');
    const loginForm = document.getElementById('login-form');

    chrome.storage.sync.get(['passwordHash'], (result) => {
        if (result.passwordHash) {
            loginForm.style.display = 'block';
            setPasswordForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            setPasswordForm.style.display = 'block';
        }
    });

    document.getElementById('set-password-btn').addEventListener('click', async () => {
        const newPassword = document.getElementById('new-password').value;
        if (newPassword.length < 4) {
            alert('Mật khẩu phải có ít nhất 4 ký tự.');
            return;
        }
        const hash = await sha256(newPassword);
        chrome.storage.sync.set({ passwordHash: hash }, () => unlockPage());
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
        const enteredPassword = document.getElementById('password').value;
        const hashToCompare = await sha256(enteredPassword);
        chrome.storage.sync.get(['passwordHash'], (result) => {
            if (result.passwordHash === hashToCompare) {
                unlockPage();
            } else {
                const errorMessage = document.getElementById('error-message');
                errorMessage.textContent = 'Mật khẩu không chính xác!';
                setTimeout(() => { errorMessage.textContent = ''; }, 2000);
            }
        });
    });

    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('login-btn').click();
    });

    function unlockPage() {
        passwordScreen.style.display = 'none';
        mainContent.style.display = 'block';
        initializeRuleManagement();
    }
});

// Hàm khởi tạo toàn bộ logic quản lý sau khi đăng nhập thành công
function initializeRuleManagement() {
    const dayMap = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };

    function formatDays(daysArray) {
        if (!daysArray || daysArray.length === 0) return 'Không có ngày nào';
        const sortedDays = [...daysArray].sort((a, b) => a - b);
        return sortedDays.map(day => dayMap[day]).join(', ');
    }

    function renderRules(rules = []) {
        const rulesListDiv = document.getElementById('rulesList');
        rulesListDiv.innerHTML = '';
        if (rules.length === 0) {
            rulesListDiv.innerHTML = '<p class="text-muted">Chưa có quy tắc nào.</p>';
            return;
        }
        rules.forEach(rule => {
            const ruleElement = document.createElement('div');
            ruleElement.className = 'card p-3';
            ruleElement.innerHTML = `<div class="d-flex justify-content-between align-items-center"><div><h5>${rule.site}</h5><small class="text-muted">Chặn từ <strong>${rule.startTime}</strong> đến <strong>${rule.endTime}</strong><br>Vào các ngày: <strong>${formatDays(rule.days)}</strong></small></div><button class="btn btn-danger btn-sm delete-btn" data-id="${rule.id}">Xóa</button></div>`;
            rulesListDiv.appendChild(ruleElement);
        });
    }

    function saveRules(rules) {
        chrome.storage.sync.set({ blockingRules: rules }, () => {
            const status = document.getElementById('status');
            status.textContent = 'Danh sách chặn đã lưu.';
            setTimeout(() => { status.textContent = ''; }, 1500);
        });
        renderRules(rules);
    }

    async function updateWhitelistFromServer() {
        const updateStatus = document.getElementById('update-status');
        const updateBtn = document.getElementById('updateWhitelistBtn');
        updateStatus.textContent = 'Đang kiểm tra...';
        updateBtn.disabled = true;

        try {
            const url = new URL(MASTER_WHITELIST_URL);
            url.searchParams.set('t', Date.now()); // Thêm tham số timestamp để "phá" cache

            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store', // Yêu cầu trình duyệt không lưu trữ gì cả
                headers: {
                    'Cache-Control': 'no-cache', // Yêu cầu server và các proxy bỏ qua cache
                }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const text = await response.text();
            const serverList = text.split('\n').filter(line => {
                const trimmed = line.trim();
                return trimmed !== '' && !trimmed.startsWith('#');
            });

            const whitelistTextarea = document.getElementById('whitelist');
            const clientList = whitelistTextarea.value.split('\n').filter(s => s.trim() !== '');
            const clientSet = new Set(clientList);
            let newItemsCount = 0;

            serverList.forEach(serverUrl => {
                if (!clientSet.has(serverUrl)) {
                    clientList.push(serverUrl);
                    newItemsCount++;
                }
            });

            if (newItemsCount > 0) {
                whitelistTextarea.value = clientList.join('\n');
                saveWhitelist();
                updateStatus.textContent = `Đã thêm ${newItemsCount} mục mới!`;
            } else {
                updateStatus.textContent = 'Danh sách của bạn đã là mới nhất!';
            }
        } catch (error) {
            console.error("Failed to update whitelist:", error);
            updateStatus.textContent = 'Lỗi! Không thể cập nhật.';
        } finally {
            updateBtn.disabled = false;
            setTimeout(() => { updateStatus.textContent = ''; }, 3000);
        }
    }

    function saveWhitelist() {
        const sites = document.getElementById('whitelist').value;
        const whitelistArray = sites.split('\n').filter(s => s.trim() !== '');
        chrome.storage.sync.set({ whitelist: whitelistArray }, () => {
            const status = document.getElementById('status');
            status.textContent = 'Whitelist đã được lưu.';
            setTimeout(() => { status.textContent = ''; }, 1500);
        });
    }

    function restoreWhitelist() {
        chrome.storage.sync.get({ whitelist: [] }, (data) => {
            document.getElementById('whitelist').value = data.whitelist.join('\n');
        });
    }

    // Tải và hiển thị dữ liệu khi bắt đầu
    chrome.storage.sync.get({ blockingRules: [] }, (data) => renderRules(data.blockingRules));
    restoreWhitelist();

    // Gán sự kiện cho các nút
    document.getElementById('saveWhitelistButton').addEventListener('click', saveWhitelist);
    document.getElementById('updateWhitelistBtn').addEventListener('click', updateWhitelistFromServer);
    document.getElementById('addRuleButton').addEventListener('click', () => {
        const newSite = document.getElementById('newSite').value.trim();
        const newStartTime = document.getElementById('newStartTime').value;
        const newEndTime = document.getElementById('newEndTime').value;
        const selectedDays = [];
        document.querySelectorAll('#days-of-week input[type="checkbox"]:checked').forEach(checkbox => {
            selectedDays.push(Number(checkbox.value));
        });

        if (!newSite) {
            alert('Vui lòng nhập tên trang web.');
            return;
        }
        if (selectedDays.length === 0) {
            alert('Vui lòng chọn ít nhất một ngày.');
            return;
        }

        const newRule = { site: newSite, startTime: newStartTime, endTime: newEndTime, days: selectedDays, id: Date.now() };
        chrome.storage.sync.get({ blockingRules: [] }, (data) => {
            const updatedRules = [...data.blockingRules, newRule];
            saveRules(updatedRules);
            document.getElementById('newSite').value = '';
        });
    });

    document.getElementById('rulesList').addEventListener('click', (event) => {
        if (event.target && event.target.classList.contains('delete-btn')) {
            const ruleIdToDelete = Number(event.target.getAttribute('data-id'));
            chrome.storage.sync.get({ blockingRules: [] }, (data) => {
                const updatedRules = data.blockingRules.filter(rule => rule.id !== ruleIdToDelete);
                saveRules(updatedRules);
            });
        }
    });
}