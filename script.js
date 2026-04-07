// ============ CONFIGURACIÓN DE FIREBASE ============
const firebaseConfig = {
    apiKey: "AIzaSyAAaKksOoCQjUDd-tu70_oTKGwYlVnXcyo",
    authDomain: "glassroomregister.firebaseapp.com",
    databaseURL: "https://glassroomregister-default-rtdb.firebaseio.com",
    projectId: "glassroomregister",
    storageBucket: "glassroomregister.firebasestorage.app",
    messagingSenderId: "158848070948",
    appId: "1:158848070948:web:801a58377e4b6d987a6fb1",
    measurementId: "G-NQZ2ZGBF9P"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Variables de paginación
let currentPage = 1;
let rowsPerPage = 5;
let filteredRecords = [];

// Variables globales
let currentUser = null;
let records = [];
let editIndex = null;
let editPdfData = null;
let newPdfData = null;
let isDark = true;
let dbListener = null;
let auditListener = null;

window.auditLog = [];

// ============ ANIMACIONES Y EFECTOS VISUALES ============

// Crear partículas flotantes en el fondo
function createParticles() {
    const bgAnim = document.querySelector('.bg-anim');
    if (!bgAnim) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'floating-particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: radial-gradient(circle, var(--accent2), transparent);
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            opacity: 0;
            animation: floatParticle ${Math.random() * 8 + 5}s linear infinite;
            animation-delay: ${Math.random() * 5}s;
            pointer-events: none;
        `;
        bgAnim.appendChild(particle);
    }
}

// Efecto ripple en botones
function addRippleEffect() {
    const buttons = document.querySelectorAll('.btn-primary, .btn-save, .tab, .btn-export, .btn-import, .btn-logout');
    buttons.forEach(btn => {
        btn.classList.add('btn-ripple');
        btn.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.4);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
                left: ${e.clientX - rect.left - size/2}px;
                top: ${e.clientY - rect.top - size/2}px;
            `;
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// Animación de conteo para estadísticas
function animateNumber(element, start, end, duration) {
    if (!element) return;
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            clearInterval(timer);
            current = end;
        }
        element.textContent = formatSoles ? formatSoles(current) : Math.round(current);
    }, 16);
}

// Actualizar stats con animación
const originalUpdateStats = updateStats;
updateStats = function() {
    const oldTotal = parseInt(document.getElementById('statTotal')?.textContent || '0');
    const oldMonto = parseFloat(document.getElementById('statMonto')?.textContent?.replace('S/ ', '').replace(/,/g, '') || '0');
    
    originalUpdateStats();
    
    const newTotal = records.length;
    const newMonto = records.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
    
    const statTotalEl = document.getElementById('statTotal');
    const statMontoEl = document.getElementById('statMonto');
    
    if (statTotalEl && oldTotal !== newTotal) {
        animateNumber(statTotalEl, oldTotal, newTotal, 500);
    }
    if (statMontoEl && oldMonto !== newMonto) {
        animateNumber(statMontoEl, oldMonto, newMonto, 500);
    }
};

// Efecto de escritura en título
function typeWriterEffect() {
    const titles = document.querySelectorAll('.logo-title, .tb-title');
    titles.forEach(title => {
        const text = title.textContent;
        title.style.width = '0';
        title.style.display = 'inline-block';
        title.style.overflow = 'hidden';
        title.style.whiteSpace = 'nowrap';
        title.classList.add('typing-effect');
        
        let i = 0;
        const typeInterval = setInterval(() => {
            if (i <= text.length) {
                title.textContent = text.substring(0, i);
                i++;
            } else {
                clearInterval(typeInterval);
                title.style.borderRight = 'none';
            }
        }, 100);
    });
}

// Notificación de nuevo registro
function showNewRecordNotification() {
    const statCard = document.querySelector('.stat-card:first-child');
    if (statCard) {
        statCard.classList.add('notification-badge');
        setTimeout(() => statCard.classList.remove('notification-badge'), 500);
    }
}

// Sobrescribir saveRecord para añadir animación
const originalSaveRecord = saveRecord;
saveRecord = async function() {
    const btn = event?.target?.closest('.btn-save');
    if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<div class="loader" style="width:18px;height:18px;border-width:2px"></div> Guardando...';
        btn.disabled = true;
        
        await originalSaveRecord();
        
        btn.innerHTML = originalText;
        btn.disabled = false;
        showNewRecordNotification();
    } else {
        await originalSaveRecord();
        showNewRecordNotification();
    }
};

// Efecto de transición entre tabs
const originalSwitchTab = switchTab;
switchTab = function(tab) {
    const currentPanel = document.querySelector('.panel.active');
    const newPanel = document.getElementById(`panel-${tab}`);
    
    if (currentPanel && newPanel && currentPanel !== newPanel) {
        currentPanel.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            originalSwitchTab(tab);
            newPanel.style.animation = 'fadeInScale 0.3s ease-out';
        }, 150);
    } else {
        originalSwitchTab(tab);
    }
    
    // Animación del tab activo
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${tab}`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.animation = 'glowPulse 0.5s';
        setTimeout(() => {
            if (activeTab.style) activeTab.style.animation = '';
        }, 500);
    }
};

// Efecto hover en filas de tabla
function addTableRowEffects() {
    const observer = new MutationObserver(() => {
        document.querySelectorAll('.data-table tr').forEach(row => {
            row.addEventListener('mouseenter', function() {
                this.style.transition = 'all 0.2s ease';
                this.style.transform = 'scale(1.01)';
                this.style.backgroundColor = 'var(--glass2)';
            });
            row.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.backgroundColor = '';
            });
        });
    });
    
    observer.observe(document.getElementById('tableBody') || document.body, {
        childList: true,
        subtree: true
    });
}

// Animación de carga inicial
function showInitialLoading() {
    const mainApp = document.getElementById('mainApp');
    if (mainApp && mainApp.style.display === 'block') {
        mainApp.classList.add('show');
        setTimeout(() => mainApp.classList.remove('show'), 500);
    }
}

// Inicializar todas las animaciones
function initAnimations() {
    createParticles();
    addRippleEffect();
    typeWriterEffect();
    addTableRowEffects();
    showInitialLoading();
    
    // Agregar fadeOut a CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.95); }
        }
        .ripple-effect {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.4);
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
        }
        .floating-particle {
            position: absolute;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnimations);
} else {
    initAnimations();
}

// Usuarios válidos
const validUsers = {
    'SANDRA': '77021712',
    'ANDREA': '123456',
    'CARLOS': 'admin123'
};

// ============ FUNCIONES DE CONEXIÓN ============
function setupRealtimeSync() {
    if (dbListener) {
        dbListener.off();
        dbListener = null;
    }
    
    if (auditListener) {
        auditListener.off();
        auditListener = null;
    }
    
    if (!currentUser) {
        console.warn('No hay usuario actual para sincronizar');
        return;
    }
    
    showLoader('table');
    
    try {
        const recordsRef = database.ref(`users/${currentUser}/records`);
        
        dbListener = recordsRef.on('value', (snapshot) => {
            if (!currentUser) return;
            
            const data = snapshot.val();
            if (data) {
                records = Object.values(data).sort((a, b) => {
                    const getTimestamp = (id) => {
                        if (!id) return 0;
                        const parts = String(id).split('_');
                        return parseInt(parts[0]) || 0;
                    };
                    return getTimestamp(b.id) - getTimestamp(a.id);
                });
            } else {
                records = [];
            }
            
            renderTable();
            updateStats();
            hideLoader('table');
            updateConnectionStatus(true);
        }, (error) => {
            if (currentUser) {
                console.error('Error de conexión:', error);
                updateConnectionStatus(false);
                hideLoader('table');
                showToast('Error de conexión con Firebase', 'error');
            }
        });
        
        const auditRef = database.ref(`users/${currentUser}/audit`);
        auditListener = auditRef.on('value', (snapshot) => {
            if (!currentUser) return;
            
            const data = snapshot.val();
            if (data) {
                window.auditLog = Object.values(data).sort((a, b) => b.id - a.id);
            } else {
                window.auditLog = [];
            }
            if (document.getElementById('panel-auditoria') && 
                document.getElementById('panel-auditoria').classList.contains('active')) {
                renderAuditTable();
            }
        });
        
    } catch (error) {
        console.error('Error al configurar sincronización:', error);
        hideLoader('table');
        showToast('Error al conectar con la nube', 'error');
    }
}

function updateConnectionStatus(isConnected) {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;
    
    if (isConnected) {
        statusDiv.innerHTML = '<span class="status-dot online"></span><span>Conectado a Firebase Cloud - Sincronización en tiempo real</span>';
    } else {
        statusDiv.innerHTML = '<span class="status-dot offline"></span><span>Sin conexión - Modo offline</span>';
    }
}

// ============ FUNCIONES DE AUDITORÍA ============
async function addAuditLog(action, recordId, details) {
    if (!currentUser || !database) {
        console.warn('No se puede registrar auditoría: usuario no logueado');
        return;
    }
    
    try {
        const auditRef = database.ref(`users/${currentUser}/audit`);
        const newAuditRef = auditRef.push();
        
        const auditEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            fechaHora: new Date().toLocaleString('es-PE'),
            usuario: currentUser,
            accion: action,
            registroId: recordId,
            detalles: details
        };
        
        await newAuditRef.set(auditEntry);
    } catch (error) {
        console.error('Error al guardar auditoría:', error);
    }
}

// ============ FUNCIONES DE LOGIN ============
function togglePasswordVisibility() {
    const input = document.getElementById('loginPass');
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

async function doLogin() {
    const username = document.getElementById('loginUser').value.trim().toUpperCase();
    const password = document.getElementById('loginPass').value;
    
    if (validUsers[username] && validUsers[username] === password) {
        currentUser = username;
        localStorage.setItem('glassroom_current_user', currentUser);
        
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        const currentUserSpan = document.getElementById('currentUser');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        if (currentUserSpan) currentUserSpan.textContent = currentUser;
        
        setupRealtimeSync();
        showToast(`Bienvenido ${currentUser} - Conectado a la nube`, 'success');
    } else {
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) {
            errorDiv.style.display = 'flex';
            setTimeout(() => errorDiv.style.display = 'none', 3000);
        }
        showToast('Usuario o contraseña incorrectos', 'error');
    }
}

const loginPass = document.getElementById('loginPass');
const loginUser = document.getElementById('loginUser');
if (loginPass) {
    loginPass.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
}
if (loginUser) {
    loginUser.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
}

function doLogout() {
    try {
        if (dbListener) {
            dbListener.off();
            dbListener = null;
        }
        
        if (auditListener) {
            auditListener.off();
            auditListener = null;
        }
        
        currentUser = null;
        records = [];
        window.auditLog = [];
        
        localStorage.removeItem('glassroom_current_user');
        
        const mainApp = document.getElementById('mainApp');
        const loginScreen = document.getElementById('loginScreen');
        
        if (mainApp) mainApp.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
        
        const loginUserField = document.getElementById('loginUser');
        const loginPassField = document.getElementById('loginPass');
        
        if (loginUserField) loginUserField.value = '';
        if (loginPassField) {
            loginPassField.value = '';
            loginPassField.type = 'password';
        }
        
        hideLoader('table');
        hideLoader('audit');
        
        showToast('Sesión cerrada correctamente', 'success');
        
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        currentUser = null;
        localStorage.removeItem('glassroom_current_user');
        const mainApp = document.getElementById('mainApp');
        const loginScreen = document.getElementById('loginScreen');
        if (mainApp) mainApp.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
        showToast('Sesión cerrada', 'success');
    }
}

// ============ FUNCIONES DE TEMA ============
function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('light', !isDark);
    const icon = document.getElementById('themeIcon');
    const lbl = document.getElementById('themeLabel');
    
    if (!icon || !lbl) return;
    
    if (isDark) {
        icon.innerHTML = '<path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zM2 13h2c.6 0 1-.4 1-1s-.4-1-1-1H2c-.6 0-1 .4-1 1s.4 1 1 1zm18 0h2c.6 0 1-.4 1-1s-.4-1-1-1h-2c-.6 0-1 .4-1 1s.4 1 1 1zM11 2v2c0 .6.4 1 1 1s1-.4 1-1V2c0-.6-.4-1-1-1s-1 .4-1 1zm0 18v2c0 .6.4 1 1 1s1-.4 1-1v-2c0-.6-.4-1-1-1s-1 .4-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.38.39-1.02 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06z"/>';
        lbl.textContent = 'Modo día';
    } else {
        icon.innerHTML = '<path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>';
        lbl.textContent = 'Modo noche';
    }
}

// ============ FUNCIONES DE TABS ============
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
    
    const tabBtn = document.getElementById(`tab-${tab}`);
    const panel = document.getElementById(`panel-${tab}`);
    
    if (tabBtn) tabBtn.classList.add('active');
    if (panel) panel.classList.add('active');
    
    if (tab === 'lista') {
        renderTable();
    } else if (tab === 'auditoria') {
        renderAuditTable();
    }
}

// ============ FUNCIONES DE FORMULARIO ============
function updateRUC() {
    const prefix = document.getElementById('rucPrefixSelect');
    const num = document.getElementById('rucNum');
    const rucFull = document.getElementById('rucFull');
    
    if (prefix && num && rucFull) {
        rucFull.textContent = num.value ? `RUC completo: ${prefix.value}${num.value}` : '';
    }
}

function updateEditRUC() {
    const prefix = document.getElementById('editRucPrefixSelect');
    const num = document.getElementById('editRucNum');
    const rucFull = document.getElementById('editRucFull');
    
    if (prefix && num && rucFull) {
        rucFull.textContent = num.value ? `RUC completo: ${prefix.value}${num.value}` : '';
    }
}

function formatSoles(value) {
    return 'S/ ' + parseFloat(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateMonto() {
    const input = document.getElementById('montoInput');
    const display = document.getElementById('montoDisplay');
    if (input && display) {
        display.textContent = formatSoles(input.value);
    }
}

function updateEditMonto() {
    const input = document.getElementById('editMonto');
    const display = document.getElementById('editMontoDisplay');
    if (input && display) {
        display.textContent = formatSoles(input.value);
    }
}

// ============ MANEJO DE PDF ============
function handlePDF(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        newPdfData = { name: file.name, data: e.target.result };
        const badge = document.getElementById('pdfBadge');
        if (badge) {
            badge.style.display = 'inline-flex';
            badge.className = 'pdf-badge';
            badge.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>${file.name}`;
        }
    };
    reader.readAsDataURL(file);
}

function handleEditPDF(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        editPdfData = { name: file.name, data: e.target.result };
        const badge = document.getElementById('editPdfBadge');
        if (badge) {
            badge.style.display = 'inline-flex';
            badge.className = 'pdf-badge';
            badge.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>${file.name}`;
        }
    };
    reader.readAsDataURL(file);
}

// ============ CRUD OPERACIONES ============
async function saveRecord() {
    const prefix = document.getElementById('rucPrefixSelect');
    const rucNum = document.getElementById('rucNum');
    const nombre = document.getElementById('nombreEmpresa');
    const recibo = document.getElementById('recibo');
    const montoInput = document.getElementById('montoInput');
    
    if (!prefix || !rucNum || !nombre || !recibo || !montoInput) {
        showToast('Error en el formulario', 'error');
        return;
    }
    
    const prefixValue = prefix.value;
    const rucNumValue = rucNum.value;
    const nombreValue = nombre.value.trim();
    const reciboValue = recibo.value.trim();
    const montoValue = parseFloat(montoInput.value) || 0;
    
    if (!rucNumValue || rucNumValue.length < 6) {
        showToast('RUC incompleto (mínimo 6 dígitos después del prefijo)', 'error');
        return;
    }
    if (!nombreValue) {
        showToast('Ingrese el nombre de empresa o persona', 'error');
        return;
    }
    if (!reciboValue) {
        showToast('Ingrese el número de recibo', 'error');
        return;
    }
    
    showLoader('table');
    
    try {
        const now = new Date();
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const recordId = `${timestamp}_${randomSuffix}`;
        
        const record = {
            id: recordId,
            rucPrefix: prefixValue,
            rucNum: rucNumValue,
            ruc: prefixValue + rucNumValue,
            nombre: nombreValue,
            recibo: reciboValue,
            monto: montoValue,
            fecha: now.toLocaleDateString('es-PE'),
            fechaHora: now.toLocaleString('es-PE'),
            createdBy: currentUser,
            createdAt: now.toISOString(),
            updatedBy: currentUser,
            updatedAt: now.toISOString(),
            pdf: newPdfData || null
        };
        
        const recordsRef = database.ref(`users/${currentUser}/records/${recordId}`);
        await recordsRef.set(record);
        await addAuditLog('CREATE', recordId, `Creó registro: ${nombreValue} - ${reciboValue} (Monto: ${formatSoles(montoValue)})`);
        
        resetForm();
        currentPage = 1;
        showToast('Registro guardado exitosamente en la nube', 'success');
        switchTab('lista');
        
    } catch (error) {
        console.error('Error al guardar:', error);
        showToast('Error al guardar en Firebase: ' + error.message, 'error');
    } finally {
        hideLoader('table');
    }
}

function resetForm() {
    const rucNum = document.getElementById('rucNum');
    const nombre = document.getElementById('nombreEmpresa');
    const recibo = document.getElementById('recibo');
    const monto = document.getElementById('montoInput');
    const montoDisplay = document.getElementById('montoDisplay');
    const rucFull = document.getElementById('rucFull');
    const pdfBadge = document.getElementById('pdfBadge');
    const pdfInput = document.getElementById('pdfInput');
    const rucPrefix = document.getElementById('rucPrefixSelect');
    
    if (rucNum) rucNum.value = '';
    if (nombre) nombre.value = '';
    if (recibo) recibo.value = '';
    if (monto) monto.value = '';
    if (montoDisplay) montoDisplay.textContent = 'S/ 0.00';
    if (rucFull) rucFull.textContent = '';
    if (pdfBadge) pdfBadge.style.display = 'none';
    if (pdfInput) pdfInput.value = '';
    if (rucPrefix) rucPrefix.value = '20';
    
    newPdfData = null;
}

function renderTable(filtered) {
    let sourceData = filtered || records;
    
    sourceData = [...sourceData].sort((a, b) => {
        const getTimestamp = (id) => {
            if (!id) return 0;
            const parts = String(id).split('_');
            return parseInt(parts[0]) || 0;
        };
        return getTimestamp(b.id) - getTimestamp(a.id);
    });
    
    filteredRecords = sourceData;
    
    const tbody = document.getElementById('tableBody');
    const empty = document.getElementById('emptyState');
    
    if (!sourceData.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        updatePaginationControls(0);
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    const totalPages = Math.ceil(sourceData.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = sourceData.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageData.map((record, idx) => {
        const globalIndex = startIndex + idx + 1;
        return `
        <tr>
            <td style="color:var(--text3);font-size:.78rem">${globalIndex}</td>
            <td><span class="${record.rucPrefix === '20' ? 'tag-20' : 'tag-10'}">${record.ruc}</span></td>
            <td style="font-weight:500">${escapeHtml(record.nombre)}</td>
            <td style="color:var(--text2)">${escapeHtml(record.recibo)}</td>
            <td class="td-monto">${formatSoles(record.monto)}</td>
            <td style="color:var(--text3);font-size:.78rem">${record.fechaHora || record.fecha}</td>
            <td style="color:var(--text3);font-size:.78rem">${record.createdBy || 'N/A'}</td>
            <td>${record.pdf ? `<span class="pdf-badge" style="cursor:pointer" onclick="viewPDF('${record.id}')"><svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>${record.pdf.name.substring(0, 12)}...</span>` : '<span style="color:var(--text3);font-size:.78rem">—</span>'}</td>
            <td>
                <div class="td-actions">
                    <button class="btn-sm btn-edit" onclick="openEdit('${record.id}')">
                        <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        Editar
                    </button>
                    <button class="btn-sm btn-del" onclick="deleteRecord('${record.id}')">
                        <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Eliminar
                    </button>
                </div>
            </td>
         </tr>
        `;
    }).join('');
    
    updatePaginationControls(totalPages);
}

function updatePaginationControls(totalPages) {
    let paginationDiv = document.getElementById('paginationControls');
    const tableWrap = document.querySelector('.table-wrap');
    
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'paginationControls';
        paginationDiv.className = 'pagination-container';
        if (tableWrap) tableWrap.appendChild(paginationDiv);
    }
    
    if (totalPages <= 1 && records.length <= rowsPerPage) {
        paginationDiv.style.display = 'none';
        return;
    }
    
    paginationDiv.style.display = 'flex';
    
    const startRecord = (currentPage - 1) * rowsPerPage + 1;
    const endRecord = Math.min(currentPage * rowsPerPage, records.length);
    
    paginationDiv.innerHTML = `
        <div class="pagination-info">
            Mostrando ${startRecord} - ${endRecord} de ${records.length} registros
        </div>
        <div class="pagination-buttons">
            <button class="pagination-btn" onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/></svg>
            </button>
            <button class="pagination-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <span class="pagination-current">
                Página ${currentPage} de ${totalPages}
            </span>
            <button class="pagination-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
            <button class="pagination-btn" onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/></svg>
            </button>
        </div>
        <div class="pagination-rows">
            <label>Mostrar:</label>
            <select class="pagination-select" onchange="changeRowsPerPage(this.value)">
                <option value="5" ${rowsPerPage === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${rowsPerPage === 10 ? 'selected' : ''}>10</option>
                <option value="20" ${rowsPerPage === 20 ? 'selected' : ''}>20</option>
                <option value="50" ${rowsPerPage === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${rowsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
            <span>registros por página</span>
        </div>
    `;
}

function changePage(page) {
    const totalPages = Math.ceil(records.length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
}

function changeRowsPerPage(value) {
    rowsPerPage = parseInt(value);
    currentPage = 1;
    renderTable();
}

function filterRecords() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    if (!query) {
        currentPage = 1;
        renderTable();
        return;
    }
    const filtered = records.filter(r => 
        r.nombre.toLowerCase().includes(query) || 
        r.ruc.includes(query) ||
        r.recibo.toLowerCase().includes(query)
    );
    currentPage = 1;
    renderTable(filtered);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function viewPDF(recordId) {
    const record = records.find(r => r.id == recordId);
    if (!record || !record.pdf) return;
    const win = window.open();
    if (win) {
        win.document.write(`<iframe src="${record.pdf.data}" style="width:100%;height:100%;border:none"/>`);
    }
}

function openEdit(recordId) {
    const record = records.find(r => r.id == recordId);
    if (!record) return;
    
    editIndex = recordId;
    editPdfData = record.pdf || null;
    
    const prefixSelect = document.getElementById('editRucPrefixSelect');
    const rucNum = document.getElementById('editRucNum');
    const nombre = document.getElementById('editNombre');
    const recibo = document.getElementById('editRecibo');
    const monto = document.getElementById('editMonto');
    const montoDisplay = document.getElementById('editMontoDisplay');
    
    if (prefixSelect) prefixSelect.value = record.rucPrefix;
    if (rucNum) rucNum.value = record.rucNum;
    if (nombre) nombre.value = record.nombre;
    if (recibo) recibo.value = record.recibo;
    if (monto) monto.value = record.monto;
    if (montoDisplay) montoDisplay.textContent = formatSoles(record.monto);
    
    updateEditRUC();
    
    const badge = document.getElementById('editPdfBadge');
    if (badge) {
        if (record.pdf) {
            badge.style.display = 'inline-flex';
            badge.className = 'pdf-badge';
            badge.innerHTML = `<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>${record.pdf.name}`;
        } else {
            badge.style.display = 'none';
        }
    }
    
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.add('open');
}

async function saveEdit() {
    if (!editIndex) return;
    
    const oldRecord = records.find(r => r.id == editIndex);
    if (!oldRecord) return;
    
    const prefixSelect = document.getElementById('editRucPrefixSelect');
    const rucNum = document.getElementById('editRucNum');
    const nombre = document.getElementById('editNombre');
    const recibo = document.getElementById('editRecibo');
    const monto = document.getElementById('editMonto');
    
    if (!prefixSelect || !rucNum || !nombre || !recibo || !monto) return;
    
    const oldNombre = oldRecord.nombre;
    const oldRecibo = oldRecord.recibo;
    const oldMonto = oldRecord.monto;
    
    const updatedRecord = {
        ...oldRecord,
        id: String(oldRecord.id),
        rucPrefix: prefixSelect.value,
        rucNum: rucNum.value,
        ruc: prefixSelect.value + rucNum.value,
        nombre: nombre.value.trim(),
        recibo: recibo.value.trim(),
        monto: parseFloat(monto.value) || 0,
        updatedBy: currentUser,
        updatedAt: new Date().toISOString(),
        fechaHora: new Date().toLocaleString('es-PE')
    };
    
    if (editPdfData) updatedRecord.pdf = editPdfData;
    
    showLoader('table');
    
    try {
        const recordsRef = database.ref(`users/${currentUser}/records/${editIndex}`);
        await recordsRef.set(updatedRecord);
        await addAuditLog('UPDATE', editIndex, `Editó registro: ${oldNombre} → ${updatedRecord.nombre}, Recibo: ${oldRecibo} → ${updatedRecord.recibo}, Monto: ${oldMonto} → ${updatedRecord.monto}`);
        closeModal();
        showToast('Registro actualizado correctamente', 'success');
    } catch (error) {
        console.error('Error al actualizar:', error);
        showToast('Error al actualizar en Firebase', 'error');
    } finally {
        hideLoader('table');
    }
}

function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.remove('open');
    editIndex = null;
    editPdfData = null;
}

const editModal = document.getElementById('editModal');
if (editModal) {
    editModal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
}

async function deleteRecord(recordId) {
    if (!confirm('¿Está seguro de eliminar este registro? Esta acción quedará registrada en auditoría.')) return;
    
    const record = records.find(r => r.id == recordId);
    if (!record) return;
    
    showLoader('table');
    
    try {
        const recordsRef = database.ref(`users/${currentUser}/records/${recordId}`);
        await recordsRef.remove();
        await addAuditLog('DELETE', recordId, `Eliminó registro: ${record.nombre} - ${record.recibo} (Monto: ${record.monto})`);
        showToast('Registro eliminado correctamente', 'success');
    } catch (error) {
        console.error('Error al eliminar:', error);
        showToast('Error al eliminar de Firebase', 'error');
    } finally {
        hideLoader('table');
    }
}

// ============ ESTADÍSTICAS ============
function updateStats() {
    const statTotal = document.getElementById('statTotal');
    const statMonto = document.getElementById('statMonto');
    const statRUC20 = document.getElementById('statRUC20');
    const statRUC10 = document.getElementById('statRUC10');
    
    if (statTotal) statTotal.textContent = records.length;
    
    const total = records.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
    if (statMonto) statMonto.textContent = formatSoles(total);
    if (statRUC20) statRUC20.textContent = records.filter(r => r.rucPrefix === '20').length;
    if (statRUC10) statRUC10.textContent = records.filter(r => r.rucPrefix === '10').length;
}

// ============ EXPORTACIONES ============
function exportExcel() {
    if (!records.length) {
        showToast('No hay registros para exportar', 'error');
        return;
    }
    
    const exportData = records.map(r => ({
        'RUC': r.ruc,
        'Empresa/Persona': r.nombre,
        'Recibo': r.recibo,
        'Monto (S/)': r.monto,
        'Fecha': r.fechaHora || r.fecha,
        'Creado por': r.createdBy,
        'Última edición por': r.updatedBy,
        'PDF adjunto': r.pdf ? 'Sí' : 'No'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registros');
    XLSX.writeFile(wb, `GlassRoom_Cloud_${currentUser}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel exportado correctamente', 'success');
}

function downloadTemplate() {
    const templateData = [
        {
            'RUC': '20123456789',
            'EMPRESA/PERSONA': 'Empresa Los Andes S.A.C. (Ejemplo)',
            'RECIBO': 'REC-001',
            'MONTO': '1500.00'
        },
        {
            'RUC': '20456789123',
            'EMPRESA/PERSONA': 'Corporación de Servicios Generales (Ejemplo)',
            'RECIBO': 'REC-002',
            'MONTO': '2500.50'
        },
        {
            'RUC': '10789123456',
            'EMPRESA/PERSONA': 'María del Carmen Gutiérrez (Ejemplo Persona Natural)',
            'RECIBO': 'REC-003',
            'MONTO': '850.75'
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 12 }];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Importacion');
    XLSX.writeFile(wb, 'Plantilla_GlassRoom_Importacion.xlsx');
    showToast('Plantilla descargada. Complete los datos respetando los encabezados.', 'success');
}

function importExcel(input) {
    const file = input.files[0];
    if (!file) {
        showToast('No se seleccionó ningún archivo', 'error');
        return;
    }
    
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
        showToast('Seleccione un archivo Excel (.xlsx, .xls) o CSV', 'error');
        input.value = '';
        return;
    }
    
    showLoader('table');
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error('El archivo no contiene hojas de cálculo');
            }
            
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            
            if (!rawRows || rawRows.length < 2) {
                throw new Error('El archivo no contiene datos (mínimo encabezados + 1 fila de datos)');
            }
            
            const headers = rawRows[0].map(h => String(h || '').trim().toLowerCase());
            
            let rucIndex = -1;
            let nombreIndex = -1;
            let reciboIndex = -1;
            let montoIndex = -1;
            
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i];
                if (header.includes('ruc') || header === 'identificación') rucIndex = i;
                if (header.includes('nombre') || header.includes('empresa') || header.includes('razon')) nombreIndex = i;
                if (header.includes('recibo') || header.includes('factura')) reciboIndex = i;
                if (header.includes('monto') || header.includes('total') || header.includes('importe')) montoIndex = i;
            }
            
            if (rucIndex === -1) rucIndex = 0;
            if (nombreIndex === -1) nombreIndex = 1;
            if (reciboIndex === -1 && headers.length > 2) reciboIndex = 2;
            if (montoIndex === -1 && headers.length > 3) montoIndex = 3;
            
            if (rucIndex === -1 || nombreIndex === -1) {
                throw new Error('No se encontraron columnas obligatorias (RUC y Nombre/Empresa)');
            }
            
            let added = 0;
            let errors = 0;
            
            for (let i = 1; i < rawRows.length; i++) {
                const row = rawRows[i];
                if (!row || row.length === 0) continue;
                
                const isEmpty = row.every(cell => !cell || String(cell).trim() === '');
                if (isEmpty) continue;
                
                try {
                    let ruc = row[rucIndex] ? String(row[rucIndex]).trim() : '';
                    let nombre = row[nombreIndex] ? String(row[nombreIndex]).trim() : '';
                    let recibo = reciboIndex !== -1 && row[reciboIndex] ? String(row[reciboIndex]).trim() : '';
                    let monto = 0;
                    
                    ruc = ruc.replace(/[^0-9]/g, '');
                    
                    if (montoIndex !== -1 && row[montoIndex]) {
                        let montoStr = String(row[montoIndex]).trim();
                        montoStr = montoStr.replace(/[^0-9.-]/g, '');
                        monto = parseFloat(montoStr) || 0;
                    }
                    
                    if (!ruc || ruc.length < 8) {
                        errors++;
                        continue;
                    }
                    
                    if (!nombre) {
                        errors++;
                        continue;
                    }
                    
                    if (!recibo) {
                        recibo = `IMP-${Date.now()}-${added + 1}`;
                    }
                    
                    const prefix = ruc.substring(0, 2);
                    const rucNumVal = ruc.substring(2);
                    const now = new Date();
                    const recordId = Date.now().toString() + Math.floor(Math.random() * 10000).toString().padStart(4, '0') + added.toString();
                    
                    const record = {
                        id: recordId,
                        rucPrefix: prefix,
                        rucNum: rucNumVal,
                        ruc: ruc,
                        nombre: nombre,
                        recibo: recibo,
                        monto: monto,
                        fecha: now.toLocaleDateString('es-PE'),
                        fechaHora: now.toLocaleString('es-PE'),
                        createdBy: currentUser,
                        createdAt: now.toISOString(),
                        updatedBy: currentUser,
                        updatedAt: now.toISOString(),
                        pdf: null
                    };
                    
                    const recordsRef = database.ref(`users/${currentUser}/records/${recordId}`);
                    await recordsRef.set(record);
                    added++;
                    
                } catch (rowError) {
                    console.error(`Error en fila ${i + 1}:`, rowError);
                    errors++;
                }
            }
            
            if (added > 0) {
                await addAuditLog('IMPORT', 'BATCH', `Importó ${added} registros desde Excel (${errors} errores)`);
                showToast(`${added} registros importados correctamente`, 'success');
                switchTab('lista');
            } else {
                showToast('No se pudo importar ningún registro. Verifique el formato del archivo.', 'error');
            }
            
        } catch (error) {
            console.error('Error al importar:', error);
            showToast(`Error: ${error.message}. Use la plantilla de ejemplo.`, 'error');
        } finally {
            hideLoader('table');
            input.value = '';
        }
    };
    
    reader.onerror = (error) => {
        console.error('Error al leer archivo:', error);
        hideLoader('table');
        showToast('Error al leer el archivo', 'error');
        input.value = '';
    };
    
    reader.readAsArrayBuffer(file);
}

function exportPDF() {
    if (!records.length) {
        showToast('No hay registros para exportar', 'error');
        return;
    }
    
    showLoader('table');
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 12;
        const contentWidth = pageWidth - (margin * 2);
        const primaryColor = [124, 106, 247];
        const textDark = [40, 40, 60];
        
        let currentY = margin;
        
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 6, 'F');
        
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.roundedRect(margin, currentY, contentWidth, 32, 4, 4, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('STUDIO VISUAL CODE', margin + (contentWidth / 2), currentY + 14, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('GlassRoom Register Cloud', margin + (contentWidth / 2), currentY + 23, { align: 'center' });
        doc.text('Reporte de Registros - Sincronización en Tiempo Real', margin + (contentWidth / 2), currentY + 29, { align: 'center' });
        
        currentY += 40;
        
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.3);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 6;
        
        doc.setFillColor(248, 248, 252);
        doc.roundedRect(margin, currentY, contentWidth, 32, 3, 3, 'F');
        doc.setDrawColor(200, 200, 220);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, currentY, contentWidth, 32, 3, 3, 'S');
        
        const totalMonto = records.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
        const countRUC20 = records.filter(r => r.rucPrefix === '20').length;
        const countRUC10 = records.filter(r => r.rucPrefix === '10').length;
        const colMid = margin + (contentWidth / 2);
        
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS DEL REPORTE', margin + 5, currentY + 6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 140);
        doc.text('Usuario:', margin + 5, currentY + 13);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(currentUser, margin + 35, currentY + 13);
        doc.setTextColor(120, 120, 140);
        doc.text('Fecha:', margin + 5, currentY + 20);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(new Date().toLocaleString('es-PE'), margin + 35, currentY + 20);
        doc.setTextColor(120, 120, 140);
        doc.text('Registros:', margin + 5, currentY + 27);
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text(records.length.toString(), margin + 35, currentY + 27);
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text('ESTADÍSTICAS', colMid + 5, currentY + 6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 140);
        doc.text('Monto total:', colMid + 5, currentY + 13);
        doc.setTextColor(74, 222, 128);
        doc.setFont('helvetica', 'bold');
        doc.text(formatSoles(totalMonto), colMid + 50, currentY + 13);
        doc.setTextColor(120, 120, 140);
        doc.setFont('helvetica', 'normal');
        doc.text('RUC inicio 20:', colMid + 5, currentY + 20);
        doc.setTextColor(124, 106, 247);
        doc.setFont('helvetica', 'bold');
        doc.text(countRUC20.toString(), colMid + 50, currentY + 20);
        doc.setTextColor(120, 120, 140);
        doc.setFont('helvetica', 'normal');
        doc.text('RUC inicio 10:', colMid + 5, currentY + 27);
        doc.setTextColor(45, 212, 191);
        doc.setFont('helvetica', 'bold');
        doc.text(countRUC10.toString(), colMid + 50, currentY + 27);
        
        currentY += 40;
        
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DE REGISTROS', margin, currentY);
        currentY += 5;
        
        const headers = ['#', 'RUC', 'EMPRESA / PERSONA', 'RECIBO', 'MONTO', 'FECHA', 'CREADO POR'];
        const rows = records.map((r, i) => [
            (i + 1).toString(),
            r.ruc,
            r.nombre.length > 35 ? r.nombre.substring(0, 32) + '...' : r.nombre,
            r.recibo.length > 18 ? r.recibo.substring(0, 15) + '...' : r.recibo,
            formatSoles(r.monto),
            (r.fechaHora || r.fecha).substring(0, 16),
            r.createdBy || 'N/A'
        ]);
        
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: currentY,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, lineColor: [200, 200, 220], lineWidth: 0.1, valign: 'middle' },
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', halign: 'center', valign: 'middle' },
            bodyStyles: { textColor: textDark, fontSize: 7, valign: 'middle' },
            alternateRowStyles: { fillColor: [248, 248, 252] },
            columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: [124, 106, 247] }, 2: { cellWidth: 55 }, 3: { cellWidth: 25, halign: 'center' }, 4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [74, 222, 128] }, 5: { cellWidth: 28, halign: 'center' }, 6: { cellWidth: 20, halign: 'center' } },
            margin: { left: margin, right: margin },
            tableWidth: contentWidth,
            pageBreak: 'auto',
            showHead: 'everyPage',
            didDrawPage: function(data) {
                if (data.pageNumber > 1) {
                    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.rect(0, 0, pageWidth, 5, 'F');
                    doc.setFontSize(7);
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'normal');
                    doc.text('Studio Visual Code - GlassRoom Register Cloud', pageWidth / 2, 3.5, { align: 'center' });
                }
            }
        });
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.3);
            doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
            doc.setFontSize(6.5);
            doc.setTextColor(120, 120, 140);
            doc.setFont('helvetica', 'normal');
            doc.text('Studio Visual Code', margin, pageHeight - 6);
            doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
            if (i === 1) {
                doc.setFontSize(5.5);
                doc.setTextColor(150, 150, 170);
                doc.text('Documento generado automáticamente - Reporte oficial con trazabilidad', pageWidth / 2, pageHeight - 2.5, { align: 'center' });
            }
        }
        
        doc.save(`GlassRoom_Reporte_${currentUser}_${new Date().toISOString().split('T')[0]}.pdf`);
        hideLoader('table');
        showToast('PDF exportado correctamente', 'success');
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
        hideLoader('table');
        showToast('Error al generar el PDF: ' + error.message, 'error');
    }
}

// ============ AUDITORÍA ============
function renderAuditTable() {
    const auditLog = window.auditLog || [];
    const tbody = document.getElementById('auditTableBody');
    const empty = document.getElementById('emptyAudit');
    
    if (!tbody) return;
    
    if (!auditLog.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    tbody.innerHTML = auditLog.map(log => {
        let actionClass = '';
        if (log.accion === 'CREATE') actionClass = 'audit-create';
        else if (log.accion === 'UPDATE') actionClass = 'audit-update';
        else if (log.accion === 'DELETE') actionClass = 'audit-delete';
        else actionClass = 'audit-create';
        
        return `
            <tr>
                <td style="font-size:.78rem;color:var(--text2)">${log.fechaHora}</td>
                <td style="font-weight:500">${escapeHtml(log.usuario)}</td>
                <td><span class="audit-badge ${actionClass}">${log.accion}</span></td>
                <td style="font-family:JetBrains Mono,monospace;font-size:.75rem">${log.registroId}</td>
                <td style="font-size:.82rem;color:var(--text2)">${escapeHtml(log.detalles)}</td>
            </tr>
        `;
    }).join('');
}

function filterAudit() {
    const searchInput = document.getElementById('auditSearchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const auditLog = window.auditLog || [];
    const tbody = document.getElementById('auditTableBody');
    const empty = document.getElementById('emptyAudit');
    
    if (!tbody) return;
    
    const filtered = auditLog.filter(log => 
        log.usuario.toLowerCase().includes(query) ||
        log.accion.toLowerCase().includes(query) ||
        log.detalles.toLowerCase().includes(query)
    );
    
    if (!filtered.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    tbody.innerHTML = filtered.map(log => {
        let actionClass = '';
        if (log.accion === 'CREATE') actionClass = 'audit-create';
        else if (log.accion === 'UPDATE') actionClass = 'audit-update';
        else if (log.accion === 'DELETE') actionClass = 'audit-delete';
        else actionClass = 'audit-create';
        
        return `
            <tr>
                <td style="font-size:.78rem;color:var(--text2)">${log.fechaHora}</td>
                <td style="font-weight:500">${escapeHtml(log.usuario)}</td>
                <td><span class="audit-badge ${actionClass}">${log.accion}</span></td>
                <td style="font-family:JetBrains Mono,monospace;font-size:.75rem">${log.registroId}</td>
                <td style="font-size:.82rem;color:var(--text2)">${escapeHtml(log.detalles)}</td>
            </tr>
        `;
    }).join('');
}

// ============ LOADERS Y TOAST ============
function showLoader(container) {
    const loaderId = `loader${container.charAt(0).toUpperCase() + container.slice(1)}`;
    const loader = document.getElementById(loaderId);
    if (loader) loader.style.display = 'flex';
}

function hideLoader(container) {
    const loaderId = `loader${container.charAt(0).toUpperCase() + container.slice(1)}`;
    const loader = document.getElementById(loaderId);
    if (loader) loader.style.display = 'none';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMsg');
    
    if (!toast || !icon || !msg) return;
    
    toast.className = `toast ${type}`;
    msg.textContent = message;
    
    if (type === 'success') {
        icon.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>';
    } else {
        icon.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
    }
    
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============ INICIALIZACIÓN ============
function checkExistingSession() {
    const savedUser = localStorage.getItem('glassroom_current_user');
    if (savedUser && validUsers[savedUser]) {
        currentUser = savedUser;
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        const currentUserSpan = document.getElementById('currentUser');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) {
            mainApp.style.display = 'block';
            if (currentUserSpan) currentUserSpan.textContent = currentUser;
            setupRealtimeSync();
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkExistingSession);
} else {
    checkExistingSession();
}
// ============ ANIMACIONES FUTURISTAS Y COOL ============

// 1. EFECTO DE RESPLANDOR NEÓN EN TARJETAS AL HOVER
function addNeonGlowEffect() {
    const cards = document.querySelectorAll('.stat-card, .form-card, .login-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transition = 'all 0.3s ease';
            this.style.transform = 'translateY(-5px) scale(1.02)';
            this.style.boxShadow = '0 0 30px rgba(124, 106, 247, 0.5), 0 0 15px rgba(45, 212, 191, 0.3)';
            this.style.borderColor = 'rgba(124, 106, 247, 0.8)';
        });
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = '';
            this.style.borderColor = '';
        });
    });
}

// 2. EFECTO DE ESCANEADO HOLOGRÁFICO EN TABLAS
function addHolographicScan() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return;
    
    const scanLine = document.createElement('div');
    scanLine.className = 'holographic-scan';
    scanLine.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: linear-gradient(90deg, transparent, var(--accent2), var(--teal), var(--accent2), transparent);
        animation: scanMove 3s linear infinite;
        pointer-events: none;
        z-index: 10;
        opacity: 0.6;
    `;
    tableWrap.style.position = 'relative';
    tableWrap.style.overflow = 'hidden';
    tableWrap.appendChild(scanLine);
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes scanMove {
            0% { top: 0; opacity: 0; }
            10% { opacity: 0.8; }
            90% { opacity: 0.8; }
            100% { top: 100%; opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// 3. EFECTO DE MATRIZ DIGITAL EN EL FONDO
function createDigitalRain() {
    const bgAnim = document.querySelector('.bg-anim');
    if (!bgAnim) return;
    
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.opacity = '0.08';
    canvas.style.pointerEvents = 'none';
    bgAnim.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;
    
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops = Array(columns).fill(1);
    
    function draw() {
        ctx.fillStyle = 'rgba(15, 15, 26, 0.04)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#7c6af7';
        ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
        
        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;
            
            ctx.fillText(char, x, y);
            
            if (y > height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }
    
    setInterval(draw, 50);
    
    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    });
}

// 4. EFECTO DE PARTÍCULAS TIPO "STAR WARS" (HIPERESPACIO)
function createHyperSpaceParticles() {
    const bgAnim = document.querySelector('.bg-anim');
    if (!bgAnim) return;
    
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.opacity = '0.15';
    canvas.style.pointerEvents = 'none';
    bgAnim.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;
    
    const particles = [];
    const particleCount = 100;
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 3 + 1,
            speedX: (Math.random() - 0.5) * 2,
            speedY: (Math.random() - 0.5) * 2,
            alpha: Math.random() * 0.5 + 0.2
        });
    }
    
    function animateParticles() {
        ctx.clearRect(0, 0, width, height);
        
        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;
            
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(124, 106, 247, ${p.alpha})`;
            ctx.fill();
            
            // Estela
            ctx.beginPath();
            ctx.arc(p.x - p.speedX * 3, p.y - p.speedY * 3, p.size * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(45, 212, 191, ${p.alpha * 0.5})`;
            ctx.fill();
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    animateParticles();
    
    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    });
}

// 5. EFECTO DE TEXTO CON BRILLO CIBERNETICO
function addCyberTextEffect() {
    const titles = document.querySelectorAll('.logo-title, .tb-title, .form-card-title');
    titles.forEach(title => {
        title.style.position = 'relative';
        title.style.display = 'inline-block';
        
        // Efecto de brillo al hover
        title.addEventListener('mouseenter', function() {
            this.style.textShadow = '0 0 10px var(--accent2), 0 0 20px var(--teal)';
            this.style.transition = 'all 0.3s ease';
        });
        title.addEventListener('mouseleave', function() {
            this.style.textShadow = '';
        });
    });
}

// 6. EFECTO DE CARGA CON CÍRCULOS CONCÉNTRICOS
function addLoadingRingEffect() {
    const loaders = document.querySelectorAll('.loader-container');
    loaders.forEach(loader => {
        const originalLoader = loader.querySelector('.loader');
        if (originalLoader && !loader.querySelector('.loading-rings')) {
            const rings = document.createElement('div');
            rings.className = 'loading-rings';
            rings.innerHTML = `
                <div class="ring"></div>
                <div class="ring"></div>
                <div class="ring"></div>
            `;
            rings.style.cssText = `
                position: relative;
                width: 60px;
                height: 60px;
            `;
            originalLoader.style.display = 'none';
            loader.appendChild(rings);
        }
    });
    
    const style = document.createElement('style');
    style.textContent = `
        .loading-rings {
            position: relative;
            width: 60px;
            height: 60px;
        }
        .ring {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid transparent;
            border-top-color: var(--accent);
            animation: ringSpin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
        }
        .ring:nth-child(2) {
            width: 80%;
            height: 80%;
            top: 10%;
            left: 10%;
            border-top-color: var(--teal);
            animation-delay: 0.3s;
            animation-duration: 1.2s;
        }
        .ring:nth-child(3) {
            width: 60%;
            height: 60%;
            top: 20%;
            left: 20%;
            border-top-color: var(--amber);
            animation-delay: 0.6s;
            animation-duration: 1s;
        }
        @keyframes ringSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// 7. EFECTO DE TRANSICIÓN TIPO "HOLOGRAMA" PARA MODALES
function addHologramModalEffect() {
    const modal = document.getElementById('editModal');
    if (!modal) return;
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (modal.classList.contains('open')) {
                    modal.style.backdropFilter = 'blur(8px)';
                    modal.style.transition = 'all 0.3s ease';
                    
                    const modalContent = modal.querySelector('.modal');
                    if (modalContent) {
                        modalContent.style.animation = 'hologramEnter 0.4s ease-out';
                    }
                }
            }
        });
    });
    
    observer.observe(modal, { attributes: true });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes hologramEnter {
            0% {
                opacity: 0;
                transform: scale(0.8) rotateX(-10deg);
                filter: blur(10px);
            }
            100% {
                opacity: 1;
                transform: scale(1) rotateX(0);
                filter: blur(0);
            }
        }
    `;
    document.head.appendChild(style);
}

// 8. EFECTO DE MOUSE TRAIL (RASTRO DE RATÓN)
function createMouseTrail() {
    const trail = [];
    const maxTrail = 15;
    
    document.addEventListener('mousemove', (e) => {
        const particle = document.createElement('div');
        particle.className = 'mouse-trail-particle';
        particle.style.cssText = `
            position: fixed;
            width: 6px;
            height: 6px;
            background: radial-gradient(circle, var(--accent2), var(--teal));
            border-radius: 50%;
            left: ${e.clientX - 3}px;
            top: ${e.clientY - 3}px;
            pointer-events: none;
            z-index: 9999;
            opacity: 0.8;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(particle);
        trail.push(particle);
        
        if (trail.length > maxTrail) {
            const oldest = trail.shift();
            oldest.style.opacity = '0';
            setTimeout(() => oldest.remove(), 300);
        }
        
        setTimeout(() => {
            if (particle.parentNode) {
                particle.style.opacity = '0';
                setTimeout(() => particle.remove(), 300);
            }
        }, 500);
    });
    
    const style = document.createElement('style');
    style.textContent = `
        .mouse-trail-particle {
            animation: trailFade 0.5s ease-out forwards;
        }
        @keyframes trailFade {
            0% { opacity: 0.8; transform: scale(1); }
            100% { opacity: 0; transform: scale(0); }
        }
    `;
    document.head.appendChild(style);
}

// 9. EFECTO DE "GLITCH" EN BOTONES IMPORTANTES
function addGlitchEffect() {
    const importantBtns = document.querySelectorAll('.btn-save, .btn-primary');
    importantBtns.forEach(btn => {
        btn.addEventListener('mouseenter', function() {
            this.style.animation = 'glitch 0.3s ease-in-out';
        });
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes glitch {
            0% { transform: translate(0); }
            20% { transform: translate(-2px, 1px); }
            40% { transform: translate(2px, -1px); }
            60% { transform: translate(-1px, 2px); }
            80% { transform: translate(1px, -2px); }
            100% { transform: translate(0); }
        }
    `;
    document.head.appendChild(style);
}

// 10. EFECTO DE OLA DE BRILLO EN TABLA AL CARGAR
function addTableWaveEffect() {
    const rows = document.querySelectorAll('.data-table tbody tr');
    rows.forEach((row, index) => {
        row.style.animation = `waveGlow 0.5s ease-out ${index * 0.05}s forwards`;
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes waveGlow {
            0% {
                opacity: 0;
                transform: translateX(-20px);
                filter: blur(2px);
            }
            100% {
                opacity: 1;
                transform: translateX(0);
                filter: blur(0);
            }
        }
    `;
    document.head.appendChild(style);
}

// 11. RELOJ DIGITAL FUTURISTA EN EL TOPBAR
function addFuturisticClock() {
    const topbar = document.querySelector('.tb-right');
    if (!topbar) return;
    
    const clock = document.createElement('div');
    clock.className = 'futuristic-clock';
    clock.style.cssText = `
        background: rgba(0, 0, 0, 0.3);
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        letter-spacing: 2px;
        color: var(--teal);
        border: 1px solid rgba(45, 212, 191, 0.3);
        box-shadow: 0 0 10px rgba(45, 212, 191, 0.2);
        margin-right: 0.5rem;
    `;
    topbar.insertBefore(clock, topbar.firstChild);
    
    function updateClock() {
        const now = new Date();
        const time = now.toLocaleTimeString('es-PE', { hour12: false });
        const date = now.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        clock.innerHTML = `${date} | ${time}`;
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

// 12. EFECTO DE ONDAS DE SONIDO EN ESTADÍSTICAS
function addSoundWaveEffect() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        const wave = document.createElement('div');
        wave.className = 'sound-wave';
        wave.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 15px;
            display: flex;
            gap: 3px;
            align-items: flex-end;
            height: 20px;
            opacity: 0.5;
        `;
        wave.innerHTML = `
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
        `;
        card.style.position = 'relative';
        card.appendChild(wave);
    });
    
    const style = document.createElement('style');
    style.textContent = `
        .wave-bar {
            width: 3px;
            background: linear-gradient(180deg, var(--accent2), var(--teal));
            border-radius: 2px;
            animation: wavePulse 0.8s ease-in-out infinite;
        }
        .wave-bar:nth-child(1) { height: 8px; animation-delay: 0s; }
        .wave-bar:nth-child(2) { height: 12px; animation-delay: 0.2s; }
        .wave-bar:nth-child(3) { height: 6px; animation-delay: 0.4s; }
        .wave-bar:nth-child(4) { height: 10px; animation-delay: 0.6s; }
        @keyframes wavePulse {
            0%, 100% { height: 4px; }
            50% { height: 16px; }
        }
    `;
    document.head.appendChild(style);
}

// ============ INICIALIZAR TODAS LAS ANIMACIONES FUTURISTAS ============
function initFuturisticAnimations() {
    setTimeout(() => {
        addNeonGlowEffect();
        addHolographicScan();
        // Elige UNA de estas dos (la que más te guste):
        // createDigitalRain();      // Lluvia de código Matrix
        createHyperSpaceParticles(); // Partículas estilo hiperespacio (más cool)
        addCyberTextEffect();
        addLoadingRingEffect();
        addHologramModalEffect();
        createMouseTrail();
        addGlitchEffect();
        addTableWaveEffect();
        addFuturisticClock();
        addSoundWaveEffect();
    }, 500);
}

// Ejecutar después de que cargue todo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFuturisticAnimations);
} else {
    initFuturisticAnimations();
}
// ============ ANIMACIONES FUTURISTAS - VOLUMEN 2 ============

// 13. EFECTO DE "ENERGÍA CORRIENTE" EN BORDES DE TABLA
function addFlowingEnergyBorder() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return;
    
    tableWrap.style.position = 'relative';
    tableWrap.style.border = 'none';
    tableWrap.style.background = 'var(--glass)';
    
    const energyBorder = document.createElement('div');
    energyBorder.className = 'energy-border';
    energyBorder.style.cssText = `
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        background: linear-gradient(90deg, 
            transparent, 
            var(--accent), 
            var(--teal), 
            var(--accent), 
            transparent);
        border-radius: var(--r);
        z-index: -1;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    `;
    
    tableWrap.insertBefore(energyBorder, tableWrap.firstChild);
    
    tableWrap.addEventListener('mouseenter', () => {
        energyBorder.style.opacity = '1';
        energyBorder.style.animation = 'energyFlow 2s linear infinite';
    });
    
    tableWrap.addEventListener('mouseleave', () => {
        energyBorder.style.opacity = '0';
        energyBorder.style.animation = 'none';
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes energyFlow {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .energy-border {
            background-size: 200% 100%;
        }
    `;
    document.head.appendChild(style);
}

// 14. EFECTO DE "LENTE DE AUMENTO CIBERNÉTICO" EN IMÁGENES/TABLA
function addCyberZoomEffect() {
    const table = document.querySelector('.data-table');
    if (!table) return;
    
    const zoomLens = document.createElement('div');
    zoomLens.className = 'cyber-lens';
    zoomLens.style.cssText = `
        position: fixed;
        width: 150px;
        height: 150px;
        border-radius: 50%;
        border: 2px solid var(--accent);
        background: radial-gradient(circle, rgba(124,106,247,0.1), transparent);
        backdrop-filter: blur(2px);
        pointer-events: none;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        transform: translate(-50%, -50%);
    `;
    document.body.appendChild(zoomLens);
    
    table.addEventListener('mousemove', (e) => {
        if (e.target.closest('td')) {
            zoomLens.style.opacity = '1';
            zoomLens.style.left = e.clientX + 'px';
            zoomLens.style.top = e.clientY + 'px';
            
            const cell = e.target.closest('td');
            cell.style.transform = 'scale(1.02)';
            cell.style.transition = 'all 0.2s ease';
            cell.style.zIndex = '10';
            cell.style.position = 'relative';
            cell.style.background = 'var(--glass2)';
        }
    });
    
    table.addEventListener('mouseleave', () => {
        zoomLens.style.opacity = '0';
        document.querySelectorAll('.data-table td').forEach(td => {
            td.style.transform = '';
            td.style.background = '';
        });
    });
}

// 15. EFECTO DE "PARTÍCULAS MAGNÉTICAS" QUE SIGUEN AL MOUSE
function createMagneticParticles() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9998';
    document.body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;
    
    const particles = [];
    const particleCount = 30;
    let mouseX = width / 2;
    let mouseY = height / 2;
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0,
            vy: 0,
            size: Math.random() * 3 + 1,
            alpha: Math.random() * 0.5 + 0.3
        });
    }
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });
    
    function animateMagneticParticles() {
        ctx.clearRect(0, 0, width, height);
        
        particles.forEach(p => {
            const dx = mouseX - p.x;
            const dy = mouseY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const force = Math.min(100 / (dist + 1), 3);
            
            if (dist < 150) {
                p.vx += (dx / dist) * force * 0.05;
                p.vy += (dy / dist) * force * 0.05;
            }
            
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.x += p.vx;
            p.y += p.vy;
            
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(124, 106, 247, ${p.alpha})`;
            ctx.fill();
        });
        
        requestAnimationFrame(animateMagneticParticles);
    }
    
    animateMagneticParticles();
    
    window.addEventListener('resize', () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    });
}

// 16. EFECTO DE "CRISTAL LÍQUIDO" EN MODALES
function addLiquidCrystalEffect() {
    const modal = document.getElementById('editModal');
    if (!modal) return;
    
    const style = document.createElement('style');
    style.textContent = `
        .modal {
            backdrop-filter: blur(10px);
            animation: liquidCrystal 0.5s ease-out;
            transform-origin: center;
        }
        @keyframes liquidCrystal {
            0% {
                opacity: 0;
                transform: scale(0.8) rotateX(15deg);
                filter: blur(20px);
            }
            50% {
                transform: scale(1.05) rotateX(-5deg);
            }
            100% {
                opacity: 1;
                transform: scale(1) rotateX(0);
                filter: blur(0);
            }
        }
    `;
    document.head.appendChild(style);
}

// 17. EFECTO DE "SEÑAL RADIOACTIVA" EN BOTONES
function addRadioactiveSignal() {
    const buttons = document.querySelectorAll('.btn-save, .btn-primary');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            this.style.animation = 'radioactivePulse 0.6s ease-out';
            setTimeout(() => {
                this.style.animation = '';
            }, 600);
        });
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes radioactivePulse {
            0% {
                box-shadow: 0 0 0 0 rgba(124, 106, 247, 0.7);
            }
            70% {
                box-shadow: 0 0 0 20px rgba(124, 106, 247, 0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(124, 106, 247, 0);
            }
        }
    `;
    document.head.appendChild(style);
}

// 18. EFECTO DE "CORTINA DE LUZ" EN TABS
function addLightCurtainEffect() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const rect = this.getBoundingClientRect();
            const curtain = document.createElement('div');
            curtain.className = 'light-curtain';
            curtain.style.cssText = `
                position: fixed;
                top: ${rect.top}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background: radial-gradient(circle, var(--accent2), transparent);
                border-radius: 50px;
                pointer-events: none;
                z-index: 1000;
                animation: curtainFade 0.5s ease-out forwards;
            `;
            document.body.appendChild(curtain);
            setTimeout(() => curtain.remove(), 500);
        });
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes curtainFade {
            0% {
                opacity: 0.8;
                transform: scale(1);
            }
            100% {
                opacity: 0;
                transform: scale(3);
            }
        }
    `;
    document.head.appendChild(style);
}

// 19. EFECTO DE "HOLOGRAFÍA 3D" EN TARJETAS DE ESTADÍSTICAS
function addHologram3DEffect() {
    const cards = document.querySelectorAll('.stat-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
            card.style.transition = 'all 0.1s ease';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
            card.style.transition = 'all 0.3s ease';
        });
    });
}

// 20. EFECTO DE "FONDO NEÓN DINÁMICO"
function addDynamicNeonBackground() {
    const style = document.createElement('style');
    style.textContent = `
        .bg-anim::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 50px,
                rgba(124, 106, 247, 0.03) 50px,
                rgba(124, 106, 247, 0.03) 100px
            );
            pointer-events: none;
            animation: neonShift 10s linear infinite;
        }
        @keyframes neonShift {
            0% { background-position: 0 0; }
            100% { background-position: 100px 100px; }
        }
    `;
    document.head.appendChild(style);
}

// 21. EFECTO DE "DESTELLO DE ÉXITO" AL GUARDAR
function addSuccessFlashEffect() {
    const originalSave = window.saveRecord;
    window.saveRecord = async function() {
        const result = await originalSave();
        
        const flash = document.createElement('div');
        flash.className = 'success-flash';
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(74, 222, 128, 0.2), transparent);
            pointer-events: none;
            z-index: 9999;
            animation: flashFade 0.5s ease-out forwards;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
        
        return result;
    };
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes flashFade {
            0% { opacity: 1; }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// 22. EFECTO DE "TECLADO CIBERNÉTICO" EN INPUTS
function addCyberKeyboardEffect() {
    const inputs = document.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.style.boxShadow = '0 0 15px var(--accent2)';
            input.style.borderColor = 'var(--accent2)';
            
            const keyPressSound = new CustomEvent('keyPressGlow', { detail: { element: input } });
            document.dispatchEvent(keyPressSound);
        });
        
        input.addEventListener('blur', () => {
            input.style.boxShadow = '';
            input.style.borderColor = '';
        });
        
        input.addEventListener('keypress', (e) => {
            const ripple = document.createElement('span');
            ripple.className = 'key-ripple';
            ripple.style.cssText = `
                position: absolute;
                background: rgba(124, 106, 247, 0.3);
                border-radius: 50%;
                pointer-events: none;
                animation: keyRipple 0.3s ease-out forwards;
            `;
            const rect = input.getBoundingClientRect();
            ripple.style.left = (e.clientX - rect.left) + 'px';
            ripple.style.top = (e.clientY - rect.top) + 'px';
            input.style.position = 'relative';
            input.appendChild(ripple);
            setTimeout(() => ripple.remove(), 300);
        });
    });
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes keyRipple {
            0% { width: 0; height: 0; opacity: 1; }
            100% { width: 50px; height: 50px; opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// ============ FUNCIÓN PARA INICIALIZAR TODO ============
function initMoreFuturisticAnimations() {
    setTimeout(() => {
        addFlowingEnergyBorder();
        addCyberZoomEffect();
        createMagneticParticles();
        addLiquidCrystalEffect();
        addRadioactiveSignal();
        addLightCurtainEffect();
        addHologram3DEffect();
        addDynamicNeonBackground();
        addSuccessFlashEffect();
        addCyberKeyboardEffect();
    }, 800);
}

// Ejecutar después de las otras animaciones
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMoreFuturisticAnimations);
} else {
    initMoreFuturisticAnimations();
}
