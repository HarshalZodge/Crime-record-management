const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://crime-record-management-80an.onrender.com';

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('crms_token');
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('crms_user')); } catch { return null; }
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
    };
}

function handle401() {
    localStorage.removeItem('crms_token');
    localStorage.removeItem('crms_user');
    window.location.href = 'login.html';
}

// Guard: redirect to login if no token
(function checkAuth() {
    if (!getToken()) window.location.href = 'login.html';
})();

// ─── Role-Based UI ────────────────────────────────────────────────────────────

function applyRoleUI(role) {
    // Elements hidden from viewers (read-only role)
    const writeOnlyEls = document.querySelectorAll('[data-role-hide="viewer"]');
    writeOnlyEls.forEach(el => {
        if (role === 'viewer') el.style.display = 'none';
    });

    // Elements visible only to admins
    const adminOnlyEls = document.querySelectorAll('[data-role-hide="non-admin"]');
    adminOnlyEls.forEach(el => {
        if (role !== 'admin') el.style.display = 'none';
    });
}

function populateSidebar(user) {
    if (!user) return;
    const avatarEl = document.getElementById('user-avatar');
    const nameEl   = document.getElementById('user-name');
    const rankEl   = document.getElementById('user-rank');
    const roleEl   = document.getElementById('user-role-badge');

    const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
    if (rankEl)   rankEl.textContent   = (user.rank || 'OFFICER') + (user.badge ? ' // ' + user.badge : '');

    if (roleEl) {
        const colors = { admin: '#e63946', officer: '#00d4ff', viewer: '#39d353' };
        roleEl.textContent = user.role.toUpperCase();
        roleEl.style.color = colors[user.role] || '#8b949e';
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { handle401(); return; }

    populateSidebar(user);
    applyRoleUI(user.role);

    fetchStats();
    fetchCases();
    fetchCriminals();
    fetchFIRs();
    fetchEvidence();
    fetchAllComplaints();

    const addCaseForm = document.getElementById('add-case-form');
    if (addCaseForm) {
        addCaseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createCase();
        });
    }

    const addCriminalForm = document.getElementById('add-criminal-form');
    if (addCriminalForm) {
        addCriminalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createCriminal();
        });
    }

    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createUser();
        });
    }

    const searchInput = document.getElementById('search-input-box');
    if (searchInput) {
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && searchInput.value.trim() !== '') {
                await runSmartSearch(searchInput.value.trim());
            }
        });
    }
});

function logout() {
    localStorage.removeItem('crms_token');
    localStorage.removeItem('crms_user');
    window.location.href = 'login.html';
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function fetchStats() {
    try {
        const res = await fetch(API_BASE + '/api/stats', { headers: authHeaders() });
        if (res.status === 401) { handle401(); return; }
        const data = await res.json();
        document.getElementById('stat-active-cases').textContent    = data.activeCases    || 0;
        document.getElementById('stat-wanted-criminals').textContent = data.wantedCriminals || 0;
        document.getElementById('stat-firs-month').textContent       = data.firsThisMonth  || 0;
        document.getElementById('stat-solved-rate').textContent      = (data.solvedRate    || 0) + '%';
    } catch (err) { console.error('Failed to fetch stats', err); }
}

async function fetchCases() {
    try {
        const res = await fetch(API_BASE + '/api/cases', { headers: authHeaders() });
        if (res.status === 401) { handle401(); return; }
        const cases = await res.json();
        const tbody = document.getElementById('cases-tbody');
        tbody.innerHTML = '';
        cases.forEach(c => {
            let badgeClass = 'low';
            if (c.priority === 'Critical') badgeClass = 'critical';
            else if (c.priority === 'High') badgeClass = 'high';
            else if (c.priority === 'Medium') badgeClass = 'medium';

            let statusPillCls = 'cold', statusPillText = '◌ COLD';
            if (c.status === 'Active') { statusPillCls = 'active'; statusPillText = '● ACTIVE'; }
            if (c.status === 'Solved') { statusPillCls = 'solved'; statusPillText = '✔ SOLVED'; }

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><span class="case-id">${c.caseId}</span></td>
              <td>${c.crimeType}</td>
              <td>${c.officer}</td>
              <td><span class="priority-badge ${badgeClass}">${c.priority.toUpperCase()}</span></td>
              <td><span class="status-pill ${statusPillCls}">${statusPillText}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error('Failed to fetch cases', err); }
}

async function fetchCriminals() {
    try {
        const res = await fetch(API_BASE + '/api/criminals', { headers: authHeaders() });
        if (res.status === 401) { handle401(); return; }
        const criminals = await res.json();
        const list = document.getElementById('criminals-list');
        list.innerHTML = '';
        criminals.forEach(c => {
            let statusTag = '', photoWantedCls = '';
            if (c.status === 'Wanted') {
                statusTag = `<span class="wanted-tag">WANTED</span>`;
                photoWantedCls = 'wanted';
            } else {
                statusTag = `<span class="arrested-tag">ARRESTED</span>`;
            }
            const item = document.createElement('div');
            item.className = 'watch-item';
            item.innerHTML = `
              <div class="criminal-photo ${photoWantedCls}">${c.photoIcon || '👤'}</div>
              <div class="criminal-info">
                <div class="criminal-name">${c.name}</div>
                <div class="criminal-meta">ID: ${c.criminalId} • ${c.crimes.toUpperCase()}</div>
              </div>
              ${statusTag}
            `;
            list.appendChild(item);
        });
    } catch (err) { console.error('Failed to fetch criminals', err); }
}

async function fetchFIRs() {
    try {
        const res = await fetch(API_BASE + '/api/firs', { headers: authHeaders() });
        if (res.status === 401) { handle401(); return; }
        const firs = await res.json();
        const list = document.getElementById('firs-list');
        list.innerHTML = '';
        firs.forEach(f => {
            const item = document.createElement('div');
            item.className = 'fir-item';
            item.innerHTML = `
              <div class="fir-top">
                <span class="fir-no">${f.firNo}</span>
                <span class="fir-time">${new Date(f.date).toLocaleDateString()}</span>
              </div>
              <div class="fir-desc">${f.description}</div>
              <div class="fir-location">📍 ${f.location}</div>
            `;
            list.appendChild(item);
        });
    } catch (err) { console.error('Failed to fetch FIRs', err); }
}

async function fetchEvidence() {
    try {
        const res = await fetch(API_BASE + '/api/evidence', { headers: authHeaders() });
        if (res.status === 401) { handle401(); return; }
        const evidence = await res.json();
        const list = document.getElementById('evidence-list');
        list.innerHTML = '';
        evidence.forEach(ev => {
            let typeCls = 'digital';
            if (ev.type === 'Physical') typeCls = 'physical';
            if (ev.type === 'Forensic') typeCls = 'forensic';
            const item = document.createElement('div');
            item.className = 'evidence-item';
            item.innerHTML = `
              <div class="ev-type-dot ${typeCls}"></div>
              <div class="ev-info">
                <div class="ev-title">${ev.title}</div>
                <div class="ev-meta">CASE: ${ev.caseId} • ${ev.type}</div>
              </div>
              <span class="ev-status">${ev.status.toUpperCase()}</span>
            `;
            list.appendChild(item);
        });
    } catch (err) { console.error('Failed to fetch evidence', err); }
}

async function fetchAllComplaints() {
    try {
        const res = await fetch(API_BASE + '/api/complaints', { headers: authHeaders() });
        if (res.status === 401) return; // Silent return, let other functions handle 401
        if (!res.ok) return;
        const complaints = await res.json();
        
        const tbody = document.getElementById('complaints-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        complaints.forEach(c => {
            let statusPillCls = 'cold', statusPillText = c.status.toUpperCase();
            if (c.status.includes('Pending')) { statusPillCls = 'critical'; statusPillText = '◌ PENDING'; }
            if (c.status.includes('Investigation')) { statusPillCls = 'active'; statusPillText = '● IN PROGRESS'; }
            if (c.status.includes('Resolved') || c.status.includes('FIR')) { statusPillCls = 'low'; statusPillText = '✔ CLOSED'; }

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${c.citizenId ? c.citizenId.name : 'Unknown User'}</td>
              <td>${c.contactNo || 'N/A'}</td>
              <td>${c.subject}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:11px;">${new Date(c.incidentDate).toLocaleDateString()}</td>
              <td>${c.location}</td>
              <td><span class="status-pill ${statusPillCls}">${statusPillText}</span></td>
              <td>
                <div style="display:flex; gap:5px; align-items:center;">
                  <button onclick="showComplaintDetails(decodeURIComponent('${encodeURIComponent(Math.max(0, c.description.length)? c.description : 'No description provided')}'))" class="btn-secondary" style="padding:3px 8px; font-size:10px; border-radius:4px; margin:0; background:var(--surface2); border:1px solid var(--border2); color:var(--text);" title="Read full description">📄 Read</button>
                  <select class="form-select" style="padding:4px; font-size:10px; width:auto; border-radius:4px; background:var(--surface2);" onchange="updateComplaintStatus('${c._id}', this.value)">
                    <option value="" disabled selected>Update...</option>
                    <option value="Under Investigation">Investigate</option>
                    <option value="Resolved">Resolve</option>
                    <option value="Converted to FIR">Convert to FIR</option>
                    <option value="Rejected">Reject</option>
                  </select>
                  <button onclick="getAIInsight('${c._id}')" class="btn-primary" style="padding:3px 8px; font-size:10px; border-radius:4px; margin:0;" title="Cross-reference with database">🧠 AI</button>
                </div>
              </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error('Failed to fetch complaints', err); }
}

function showComplaintDetails(text) {
    const modal = document.getElementById('complaint-detail-modal');
    if (modal) {
        document.getElementById('complaint-desc-text').innerText = text;
        modal.classList.add('show');
    } else {
        alert(text);
    }
}

async function getAIInsight(complaintId) {
    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳...';
    btn.disabled = true;

    try {
        const res = await fetch(API_BASE + '/api/ai/analyze-complaint/' + complaintId, {
            headers: authHeaders()
        });
        const data = await res.json();
        
        if (res.ok) {
            // Use a simple prompt/alert style modal for now
            alert("🧠 GEMINI INTELLIGENCE REPORT:\n\n" + data.insights);
        } else {
            alert("AI Error: " + data.message);
        }
    } catch (err) {
        alert("Failed to connect to AI engine.");
    }
    
    btn.innerHTML = oldText;
    btn.disabled = false;
}

async function updateComplaintStatus(complaintId, newStatus) {
    if (!newStatus) return;
    try {
        const res = await fetch(API_BASE + '/api/complaints/' + complaintId + '/status', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            fetchAllComplaints();
        } else {
            alert('Failed to update complaint status.');
        }
    } catch (err) {
        console.error('Update status error', err);
    }
}

async function createCase() {
    const data = {
        caseId:      document.getElementById('caseIdIn').value,
        crimeType:   document.getElementById('crimeTypeIn').value,
        priority:    document.getElementById('priorityIn').value,
        officer:     document.getElementById('officerIn').value,
        status:      document.getElementById('statusIn').value,
        location:    document.getElementById('locationIn').value,
        description: document.getElementById('descriptionIn').value
    };
    try {
        const res = await fetch(API_BASE + '/api/cases', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(data)
        });
        if (res.status === 401) { handle401(); return; }
        if (res.ok) {
            document.querySelector('.modal-overlay').classList.remove('show');
            document.getElementById('add-case-form').reset();
            fetchCases();
            fetchStats();
        } else {
            const err = await res.json();
            alert('Error adding case: ' + err.message);
        }
    } catch (err) { console.error('Failed to create case', err); }
}

async function createCriminal() {
    const data = {
        criminalId: document.getElementById('crimIdIn').value,
        name:       document.getElementById('crimNameIn').value,
        status:     document.getElementById('crimStatusIn').value,
        crimes:     document.getElementById('crimCrimesIn').value
    };
    try {
        const res = await fetch(API_BASE + '/api/criminals', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(data)
        });
        if (res.status === 401) { handle401(); return; }
        if (res.ok) {
            document.getElementById('modal-add-criminal').classList.remove('show');
            document.getElementById('add-criminal-form').reset();
            fetchCriminals();
            fetchStats();
        } else {
            const err = await res.json();
            alert('Error adding criminal: ' + err.message);
        }
    } catch (err) { console.error('Failed to create criminal', err); }
}

async function createUser() {
    const data = {
        name:     document.getElementById('userNameIn').value,
        username: document.getElementById('userUsernameIn').value,
        email:    document.getElementById('userEmailIn').value,
        password: document.getElementById('userPassIn').value,
        role:     document.getElementById('userRoleIn').value,
        rank:     document.getElementById('userRankIn').value,
        badge:    document.getElementById('userBadgeIn').value
    };
    try {
        const res = await fetch(API_BASE + '/api/auth/register', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(data)
        });
        if (res.status === 401) { handle401(); return; }
        if (res.ok) {
            document.getElementById('modal-add-user').classList.remove('show');
            document.getElementById('add-user-form').reset();
            alert('User successfully registered!');
        } else {
            const err = await res.json();
            alert('Error registering user: ' + err.message);
        }
    } catch (err) { console.error('Failed to register user', err); }
}

async function runSmartSearch(query) {
    const modal           = document.getElementById('search-modal');
    const queryText       = document.getElementById('search-query-text');
    const resultsContainer = document.getElementById('search-results-content');

    queryText.textContent = query;
    resultsContainer.innerHTML = 'Searching records using Gemini AI... please wait.<br><div style="margin-top:10px;width:20px;height:20px;border:2px solid var(--cyan);border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;"></div>';
    modal.classList.add('show');

    if (!document.getElementById('spin-style')) {
        const style = document.createElement('style');
        style.id = 'spin-style';
        style.innerHTML = '@keyframes spin { 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    try {
        const res = await fetch(API_BASE + '/api/smart-search', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ query })
        });
        if (res.status === 401) { handle401(); return; }
        const data = await res.json();
        if (res.ok) {
            let formattedText = data.result
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br/>');
            resultsContainer.innerHTML = formattedText;
        } else {
            resultsContainer.innerHTML = '<span style="color:var(--accent);">Error: ' + data.message + '</span>';
        }
    } catch (err) {
        resultsContainer.innerHTML = '<span style="color:var(--accent);">Search request failed: ' + err.message + '</span>';
    }
}
