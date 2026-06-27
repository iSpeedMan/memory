const tabCatsBtn = document.getElementById('tabCatsBtn');
const tabUsersBtn = document.getElementById('tabUsersBtn');
const tabStatsBtn = document.getElementById('tabStatsBtn');
const tabCustomCatsBtn = document.getElementById('tabCustomCatsBtn');
const tabShopBtn = document.getElementById('tabShopBtn');
const adminCatsSection = document.getElementById('adminCatsSection');
const adminUsersSection = document.getElementById('adminUsersSection');
const adminStatsSection = document.getElementById('adminStatsSection');
const adminCustomCatsSection = document.getElementById('adminCustomCatsSection');
const adminShopSection = document.getElementById('adminShopSection');

function setAdminTab(active) {
    const tabs = [
        { btn: tabCatsBtn,       sec: adminCatsSection },
        { btn: tabUsersBtn,      sec: adminUsersSection },
        { btn: tabStatsBtn,      sec: adminStatsSection },
        { btn: tabCustomCatsBtn, sec: adminCustomCatsSection },
        { btn: tabShopBtn,       sec: adminShopSection },
    ];
    tabs.forEach(({ btn, sec }) => {
        if (!btn || !sec) return;
        if (btn === active.btn) {
            btn.classList.replace('secondary', 'accent-purple');
            sec.classList.remove('hidden');
        } else {
            btn.classList.replace('accent-purple', 'secondary');
            sec.classList.add('hidden');
        }
    });
}

if (tabCatsBtn) tabCatsBtn.onclick = () => setAdminTab({ btn: tabCatsBtn, sec: adminCatsSection });
if (tabUsersBtn) tabUsersBtn.onclick = () => {
    setAdminTab({ btn: tabUsersBtn, sec: adminUsersSection });
    loadAdminUsers();
};
if (tabStatsBtn) tabStatsBtn.onclick = () => {
    setAdminTab({ btn: tabStatsBtn, sec: adminStatsSection });
    loadServerStats();
};
if (tabCustomCatsBtn) tabCustomCatsBtn.onclick = () => {
    setAdminTab({ btn: tabCustomCatsBtn, sec: adminCustomCatsSection });
    loadCustomCats();
};
if (tabShopBtn) tabShopBtn.onclick = () => {
    setAdminTab({ btn: tabShopBtn, sec: adminShopSection });
    if (typeof window._onAdminShopTabOpen === 'function') window._onAdminShopTabOpen();
};

const _adminModal = document.getElementById('adminModal');

function closeAdminModal() {
    if (_adminModal) _adminModal.classList.add('hidden');
    window.modalPop('admin');
}

if (document.getElementById('adminBtn')) {
    document.getElementById('adminBtn').onclick = () => {
        if (_adminModal) _adminModal.classList.remove('hidden');
        window.modalPush('admin', closeAdminModal);
        loadPendingCatsBadge();
    };
}
if (document.getElementById('closeAdminModalBtn')) {
    document.getElementById('closeAdminModalBtn').onclick = closeAdminModal;
}
if (_adminModal) window.addSwipeClose(_adminModal, closeAdminModal);
