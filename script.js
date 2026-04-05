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
let currentUserRole = 'user';
let records = [];
let editIndex = null;
let editPdfData = null;
let newPdfData = null;
let isDark = true;
let dbListener = null;
let auditListener = null;
let usersListener = null;
let allAuditLogs = {};

window.auditLog = [];

// Usuarios válidos (se cargarán desde Firebase)
let validUsers = {
    'ADMIN': 'admin123'
};

// Roles de usuarios
let userRoles = {
    'ADMIN': 'admin'
};

// ============ FUNCIONES DE USUARIOS ============
async function loadUsersFromFirebase() {
    if (!currentUser || currentUserRole !== 'admin') return;
    
    try {
        const usersRef = database.ref('users_list');
        const snapshot = await usersRef.once('value');
        const data = snapshot.val();
        
        if (data) {
            validUsers = {};
            userRoles = {};
            for (const [username, userData] of Object.entries(data)) {
                validUsers[username] = userData.password;
                userRoles[username] = userData.role || 'user';
            }
        }
        
        // Asegurar que ADMIN siempre existe
        if (!validUsers['ADMIN']) {
            validUsers['ADMIN'] = 'admin123';
            userRoles['ADMIN'] = 'admin';
            await database.ref('users_list/ADMIN').set({
                password: 'admin123',
                role: 'admin',
                createdAt: new Date().toISOString()
            });
        }
        
        renderUsersTable();
        updateAdminStats();
        updateAuditUserFilter();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function setupUsersListener() {
    if (!currentUser || currentUserRole !== 'admin') return;
    
    if (usersListener) {
        usersListener.off();
    }
    
    const usersRef = database.ref('users_list');
    usersListener = usersRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            validUsers = {};
            userRoles = {};
            for (const [username, userData] of Object.entries(data)) {
                validUsers[username] = userData.password;
                userRoles[username] = userData.role || 'user';
            }
        }
        renderUsersTable();
        updateAdminStats();
        updateAuditUserFilter();
    });
}

async function addUser() {
    if (currentUserRole !== 'admin') {
        showToast('Solo administradores pueden agregar usuarios', 'error');
        return;
    }
    
    const username = document.getElementById('newUsername').value.trim().toUpperCase();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    
    if (!username) {
        showToast('Ingrese un nombre de usuario', 'error');
        return;
    }
    
    if (!password || password.length < 4) {
        showToast('La contraseña debe tener al menos 4 caracteres', 'error');
        return;
    }
    
    if (validUsers[username]) {
        showToast('El usuario ya existe', 'error');
        return;
    }
    
    showLoader('table');
    
    try {
        const usersRef = database.ref(`users_list/${username}`);
        await usersRef.set({
            password: password,
            role: role,
            createdAt: new Date().toISOString(),
            createdBy: currentUser
        });
        
        // Crear estructura vacía para el nuevo usuario
        await database.ref(`users/${username}`).set({
            records: {},
            audit: {}
        });
        
        await addAuditLog('USER_CREATE', username, `Administrador ${currentUser} creó usuario ${username} con rol ${role}`);
        
        document.getElementById('newUsername').value = '';
        document.getElementById('newUserPassword').value = '';
        
        showToast(`Usuario ${username} creado exitosamente`, 'success');
        
    } catch (error) {
        console.error('Error adding user:', error);
        showToast('Error al crear usuario', 'error');
    } finally {
        hideLoader('table');
    }
}

async function deleteUser(username) {
    if (currentUserRole !== 'admin') {
        showToast('Solo administradores pueden eliminar usuarios', 'error');
        return;
    }
    
    if (username === 'ADMIN') {
        showToast('No se puede eliminar el usuario administrador principal', 'error');
        return;
    }
    
    if (username === currentUser) {
        showToast('No puedes eliminar tu propio usuario', 'error');
        return;
    }
    
    if (!confirm(`¿Está seguro de eliminar al usuario ${username}? Se eliminarán todos sus registros y auditorías.`)) return;
    
    showLoader('table');
    
    try {
        // Eliminar usuario de la lista
        await database.ref(`users_list/${username}`).remove();
        
        // Eliminar todos los datos del usuario
        await database.ref(`users/${username}`).remove();
        
        await addAuditLog('USER_DELETE', username, `Administrador ${currentUser} eliminó usuario ${username}`);
        
        showToast(`Usuario ${username} eliminado`, 'success');
        
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error al eliminar usuario', 'error');
    } finally {
        hideLoader('table');
    }
}

async function updateUserRole(username, newRole) {
    if (currentUserRole !== 'admin') return;
    
    if (username === 'ADMIN' && newRole !== 'admin') {
        showToast('El usuario ADMIN debe mantener rol de administrador', 'error');
        renderUsersTable(); // Recargar para mostrar el rol correcto
        return;
    }
    
    showLoader('table');
    
    try {
        await database.ref(`users_list/${username}/role`).set(newRole);
        await addAuditLog('USER_UPDATE', username, `Administrador ${currentUser} cambió rol de ${username} a ${newRole}`);
        showToast(`Rol de ${username} actualizado`, 'success');
    } catch (error) {
        console.error('Error updating role:', error);
        showToast('Error al actualizar rol', 'error');
    } finally {
        hideLoader('table');
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const users = Object.keys(validUsers);
    
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No hay usuarios</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(username => `
        <tr>
            <td style="font-weight:500">${escapeHtml(username)}</td>
            <td>
                ${currentUserRole === 'admin' && username !== 'ADMIN' ? 
                    `<select class="fg-select" style="padding:0.3rem;font-size:0.75rem" onchange="updateUserRole('${username}', this.value)">
                        <option value="user" ${userRoles[username] === 'user' ? 'selected' : ''}>Usuario Normal</option>
                        <option value="admin" ${userRoles[username] === 'admin' ? 'selected' : ''}>Administrador</option>
                    </select>` :
                    `<span class="${userRoles[username] === 'admin' ? 'tag-20' : 'tag-10'}">${userRoles[username] === 'admin' ? 'Administrador' : 'Usuario'}</span>`
                }
            </td>
            <td style="color:var(--text3);font-size:0.75rem">-</td>
            <td>
                ${currentUserRole === 'admin' && username !== 'ADMIN' && username !== currentUser ?
                    `<button class="btn-sm btn-del" onclick="deleteUser('${username}')">
                        <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Eliminar
                    </button>` : 
                    `<span style="color:var(--text3);font-size:0.7rem">—</span>`
                }
            </td>
        </tr>
    `).join('');
}

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
        
        // Si es admin, cargar usuarios y estadísticas
        if (currentUserRole === 'admin') {
            loadUsersFromFirebase();
            setupUsersListener();
            loadAllAuditLogs();
        }
        
    } catch (error) {
        console.error('Error al configurar sincronización:', error);
        hideLoader('table');
        showToast('Error al conectar con la nube', 'error');
    }
}

async function loadAllAuditLogs() {
    if (currentUserRole !== 'admin') return;
    
    try {
        const usersRef = database.ref('users_list');
        const usersSnapshot = await usersRef.once('value');
        const users = usersSnapshot.val();
        
        if (users) {
            for (const [username, userData] of Object.entries(users)) {
                const auditRef = database.ref(`users/${username}/audit`);
                const auditSnapshot = await auditRef.once('value');
                const auditData = auditSnapshot.val();
                
                if (auditData) {
                    allAuditLogs[username] = Object.values(auditData);
                } else {
                    allAuditLogs[username] = [];
                }
            }
        }
        
        updateAdminStats();
        updateAuditUserFilter();
    } catch (error) {
        console.error('Error loading all audit logs:', error);
    }
}

function updateAuditUserFilter() {
    const filterDiv = document.getElementById('auditUserFilter');
    const select = document.getElementById('auditUserSelect');
    
    if (!filterDiv || !select) return;
    
    if (currentUserRole === 'admin') {
        filterDiv.style.display = 'block';
        const users = Object.keys(validUsers);
        select.innerHTML = '<option value="">Todos los usuarios</option>' + 
            users.map(u => `<option value="${u}">${u}</option>`).join('');
    } else {
        filterDiv.style.display = 'none';
    }
}

function filterAuditByUser() {
    if (currentUserRole === 'admin') {
        renderAuditTable();
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

async function deleteAuditLogEntry(auditId, username) {
    if (currentUserRole !== 'admin') {
        showToast('Solo administradores pueden eliminar registros de auditoría', 'error');
        return;
    }
    
    const targetUser = username || currentUser;
    
    if (!confirm(`¿Eliminar este registro de auditoría?`)) return;
    
    showLoader('audit');
    
    try {
        const auditRef = database.ref(`users/${targetUser}/audit`);
        const snapshot = await auditRef.once('value');
        const data = snapshot.val();
        
        if (data) {
            for (const [key, value] of Object.entries(data)) {
                if (value.id == auditId) {
                    await auditRef.child(key).remove();
                    break;
                }
            }
        }
        
        await addAuditLog('AUDIT_DELETE', auditId.toString(), `Administrador ${currentUser} eliminó registro de auditoría de ${targetUser}`);
        showToast('Registro de auditoría eliminado', 'success');
        
        if (currentUserRole === 'admin') {
            await loadAllAuditLogs();
        }
        renderAuditTable();
        
    } catch (error) {
        console.error('Error deleting audit log:', error);
        showToast('Error al eliminar registro', 'error');
    } finally {
        hideLoader('audit');
    }
}

async function cleanAuditLogs() {
    if (currentUserRole !== 'admin') {
        showToast('Solo administradores pueden limpiar auditorías', 'error');
        return;
    }
    
    const selectedUser = document.getElementById('cleanAuditUser').value;
    const targetUser = selectedUser || currentUser;
    
    if (!confirm(`¿Eliminar TODOS los registros de auditoría de ${targetUser === '' ? 'TODOS los usuarios' : targetUser}? Esta acción no se puede deshacer.`)) return;
    
    showLoader('audit');
    
    try {
        if (selectedUser === '') {
            // Limpiar todos los usuarios
            const users = Object.keys(validUsers);
            for (const user of users) {
                await database.ref(`users/${user}/audit`).remove();
            }
            await addAuditLog('AUDIT_CLEAN_ALL', 'ALL', `Administrador ${currentUser} limpió TODAS las auditorías del sistema`);
            showToast('Todas las auditorías han sido eliminadas', 'success');
        } else {
            // Limpiar solo un usuario
            await database.ref(`users/${selectedUser}/audit`).remove();
            await addAuditLog('AUDIT_CLEAN', selectedUser, `Administrador ${currentUser} limpió auditorías de ${selectedUser}`);
            showToast(`Auditorías de ${selectedUser} eliminadas`, 'success');
        }
        
        if (currentUserRole === 'admin') {
            await loadAllAuditLogs();
        }
        renderAuditTable();
        
    } catch (error) {
        console.error('Error cleaning audit logs:', error);
        showToast('Error al limpiar auditorías', 'error');
    } finally {
        hideLoader('audit');
    }
}

async function cleanAllAuditLogs() {
    if (currentUserRole !== 'admin') {
        showToast('Solo administradores pueden limpiar auditorías', 'error');
        return;
    }
    
    if (!confirm('⚠️ ADVERTENCIA: Esto eliminará TODOS los registros de auditoría de TODOS los usuarios. ¿Está ABSOLUTAMENTE seguro?')) return;
    
    showLoader('audit');
    
    try {
        const users = Object.keys(validUsers);
        for (const user of users) {
            await database.ref(`users/${user}/audit`).remove();
        }
        await addAuditLog('AUDIT_CLEAN_ALL', 'ALL', `Administrador ${currentUser} limpió TODAS las auditorías del sistema`);
        showToast('Todas las auditorías han sido eliminadas', 'success');
        
        if (currentUserRole === 'admin') {
            await loadAllAuditLogs();
        }
        renderAuditTable();
        
    } catch (error) {
        console.error('Error cleaning all audit logs:', error);
        showToast('Error al limpiar auditorías', 'error');
    } finally {
        hideLoader('audit');
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
    
    // Primero cargar usuarios desde Firebase para verificar
    try {
        const usersRef = database.ref('users_list');
        const snapshot = await usersRef.once('value');
        const usersData = snapshot.val();
        
        if (usersData && usersData[username] && usersData[username].password === password) {
            currentUser = username;
            currentUserRole = usersData[username].role || 'user';
            localStorage.setItem('glassroom_current_user', currentUser);
            localStorage.setItem('glassroom_current_role', currentUserRole);
            
            const loginScreen = document.getElementById('loginScreen');
            const mainApp = document.getElementById('mainApp');
            const currentUserSpan = document.getElementById('currentUser');
            const adminTab = document.getElementById('tab-admin');
            
            if (loginScreen) loginScreen.style.display = 'none';
            if (mainApp) mainApp.style.display = 'block';
            if (currentUserSpan) currentUserSpan.textContent = currentUser;
            
            // Mostrar pestaña de administración solo si es admin
            if (adminTab) {
                adminTab.style.display = currentUserRole === 'admin' ? 'inline-flex' : 'none';
            }
            
            setupRealtimeSync();
            showToast(`Bienvenido ${currentUser} - Conectado a la nube`, 'success');
            return;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
    
    // Fallback para ADMIN local
    if (username === 'ADMIN' && password === 'admin123') {
        currentUser = username;
        currentUserRole = 'admin';
        localStorage.setItem('glassroom_current_user', currentUser);
        localStorage.setItem('glassroom_current_role', currentUserRole);
        
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        const currentUserSpan = document.getElementById('currentUser');
        const adminTab = document.getElementById('tab-admin');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        if (currentUserSpan) currentUserSpan.textContent = currentUser;
        if (adminTab) adminTab.style.display = 'inline-flex';
        
        setupRealtimeSync();
        showToast(`Bienvenido ${currentUser} - Conectado a la nube`, 'success');
        return;
    }
    
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.style.display = 'flex';
        setTimeout(() => errorDiv.style.display = 'none', 3000);
    }
    showToast('Usuario o contraseña incorrectos', 'error');
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
        
        if (usersListener) {
            usersListener.off();
            usersListener = null;
        }
        
        currentUser = null;
        currentUserRole = 'user';
        records = [];
        window.auditLog = [];
        
        localStorage.removeItem('glassroom_current_user');
        localStorage.removeItem('glassroom_current_role');
        
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
    } else if (tab === 'admin' && currentUserRole === 'admin') {
        renderUsersTable();
        updateAdminStats();
        const cleanSelect = document.getElementById('cleanAuditUser');
        if (cleanSelect) {
            cleanSelect.innerHTML = '<option value="">Todos los usuarios</option>' + 
                Object.keys(validUsers).map(u => `<option value="${u}">${u}</option>`).join('');
        }
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
    const fechaEmision = document.getElementById('fechaEmision');
    
    if (!prefix || !rucNum || !nombre || !recibo || !montoInput) {
        showToast('Error en el formulario', 'error');
        return;
    }
    
    const prefixValue = prefix.value;
    const rucNumValue = rucNum.value;
    const nombreValue = nombre.value.trim();
    const reciboValue = recibo.value.trim();
    const montoValue = parseFloat(montoInput.value) || 0;
    const fechaEmisionValue = fechaEmision ? fechaEmision.value : new Date().toISOString().split('T')[0];
    
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
            fechaEmision: fechaEmisionValue,
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
    const fechaEmision = document.getElementById('fechaEmision');
    
    if (rucNum) rucNum.value = '';
    if (nombre) nombre.value = '';
    if (recibo) recibo.value = '';
    if (monto) monto.value = '';
    if (montoDisplay) montoDisplay.textContent = 'S/ 0.00';
    if (rucFull) rucFull.textContent = '';
    if (pdfBadge) pdfBadge.style.display = 'none';
    if (pdfInput) pdfInput.value = '';
    if (rucPrefix) rucPrefix.value = '20';
    if (fechaEmision) fechaEmision.value = '';
    
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
            <td style="color:var(--text2);font-size:.78rem">${record.fechaEmision || '-'}</td>
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
          </>
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
    const fechaEmision = document.getElementById('editFechaEmision');
    
    if (prefixSelect) prefixSelect.value = record.rucPrefix;
    if (rucNum) rucNum.value = record.rucNum;
    if (nombre) nombre.value = record.nombre;
    if (recibo) recibo.value = record.recibo;
    if (monto) monto.value = record.monto;
    if (montoDisplay) montoDisplay.textContent = formatSoles(record.monto);
    if (fechaEmision) fechaEmision.value = record.fechaEmision || '';
    
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
    const fechaEmision = document.getElementById('editFechaEmision');
    
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
        fechaEmision: fechaEmision ? fechaEmision.value : (oldRecord.fechaEmision || ''),
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

async function updateAdminStats() {
    if (currentUserRole !== 'admin') return;
    
    const totalUsers = Object.keys(validUsers).length;
    document.getElementById('adminTotalUsers').textContent = totalUsers;
    
    let totalRecords = 0;
    let totalAudits = 0;
    
    for (const username of Object.keys(validUsers)) {
        try {
            const recordsSnapshot = await database.ref(`users/${username}/records`).once('value');
            const recordsData = recordsSnapshot.val();
            if (recordsData) totalRecords += Object.keys(recordsData).length;
            
            const auditSnapshot = await database.ref(`users/${username}/audit`).once('value');
            const auditData = auditSnapshot.val();
            if (auditData) totalAudits += Object.keys(auditData).length;
        } catch (error) {
            console.error(`Error getting stats for ${username}:`, error);
        }
    }
    
    document.getElementById('adminTotalRecords').textContent = totalRecords;
    document.getElementById('adminTotalAudits').textContent = totalAudits;
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
        'Fecha Emisión': r.fechaEmision || '',
        'Fecha Registro': r.fechaHora || r.fecha,
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
            'MONTO': '1500.00',
            'FECHA_EMISION': '2024-01-15'
        },
        {
            'RUC': '20456789123',
            'EMPRESA/PERSONA': 'Corporación de Servicios Generales (Ejemplo)',
            'RECIBO': 'REC-002',
            'MONTO': '2500.50',
            'FECHA_EMISION': '2024-01-20'
        },
        {
            'RUC': '10789123456',
            'EMPRESA/PERSONA': 'María del Carmen Gutiérrez (Ejemplo Persona Natural)',
            'RECIBO': 'REC-003',
            'MONTO': '850.75',
            'FECHA_EMISION': '2024-01-25'
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
    
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
            let fechaIndex = -1;
            
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i];
                if (header.includes('ruc') || header === 'identificación') rucIndex = i;
                if (header.includes('nombre') || header.includes('empresa') || header.includes('razon')) nombreIndex = i;
                if (header.includes('recibo') || header.includes('factura')) reciboIndex = i;
                if (header.includes('monto') || header.includes('total') || header.includes('importe')) montoIndex = i;
                if (header.includes('fecha') || header.includes('emision')) fechaIndex = i;
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
                    let fechaEmision = fechaIndex !== -1 && row[fechaIndex] ? String(row[fechaIndex]).trim() : '';
                    
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
                    
                    if (fechaEmision && !/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) {
                        fechaEmision = '';
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
                        fechaEmision: fechaEmision,
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
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
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
        
        const headers = ['#', 'RUC', 'EMPRESA / PERSONA', 'RECIBO', 'MONTO', 'FECHA EMISIÓN', 'FECHA REGISTRO', 'CREADO POR'];
        const rows = records.map((r, i) => [
            (i + 1).toString(),
            r.ruc,
            r.nombre.length > 30 ? r.nombre.substring(0, 27) + '...' : r.nombre,
            r.recibo.length > 15 ? r.recibo.substring(0, 12) + '...' : r.recibo,
            formatSoles(r.monto),
            r.fechaEmision || '-',
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
            columnStyles: { 
                0: { cellWidth: 8, halign: 'center' }, 
                1: { cellWidth: 25, halign: 'center', fontStyle: 'bold', textColor: [124, 106, 247] }, 
                2: { cellWidth: 50 }, 
                3: { cellWidth: 22, halign: 'center' }, 
                4: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [74, 222, 128] },
                5: { cellWidth: 22, halign: 'center' },
                6: { cellWidth: 28, halign: 'center' },
                7: { cellWidth: 20, halign: 'center' }
            },
            margin: { left: margin, right: margin },
            tableWidth: contentWidth,
            pageBreak: 'auto',
            showHead: 'everyPage'
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
    const selectedUser = document.getElementById('auditUserSelect')?.value || '';
    let auditData = [];
    
    if (currentUserRole === 'admin' && selectedUser) {
        auditData = allAuditLogs[selectedUser] || [];
        auditData = [...auditData].sort((a, b) => b.id - a.id);
    } else if (currentUserRole === 'admin' && !selectedUser) {
        // Todos los usuarios
        auditData = [];
        for (const [username, logs] of Object.entries(allAuditLogs)) {
            if (logs && logs.length) {
                auditData.push(...logs.map(log => ({ ...log, usuarioOriginal: username })));
            }
        }
        auditData = auditData.sort((a, b) => b.id - a.id);
    } else {
        auditData = window.auditLog || [];
    }
    
    const tbody = document.getElementById('auditTableBody');
    const empty = document.getElementById('emptyAudit');
    
    if (!tbody) return;
    
    if (!auditData.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    tbody.innerHTML = auditData.map(log => {
        let actionClass = '';
        if (log.accion === 'CREATE') actionClass = 'audit-create';
        else if (log.accion === 'UPDATE') actionClass = 'audit-update';
        else if (log.accion === 'DELETE') actionClass = 'audit-delete';
        else if (log.accion === 'IMPORT') actionClass = 'audit-create';
        else if (log.accion === 'USER_CREATE' || log.accion === 'USER_UPDATE' || log.accion === 'USER_DELETE') actionClass = 'audit-update';
        else if (log.accion === 'AUDIT_CLEAN' || log.accion === 'AUDIT_CLEAN_ALL' || log.accion === 'AUDIT_DELETE') actionClass = 'audit-delete';
        else actionClass = 'audit-create';
        
        const displayUser = log.usuarioOriginal || log.usuario;
        
        return `
            <tr>
                <td style="font-size:.78rem;color:var(--text2)">${log.fechaHora}</td>
                <td style="font-weight:500">${escapeHtml(displayUser)}</td>
                <td><span class="audit-badge ${actionClass}">${log.accion}</span></td>
                <td style="font-family:JetBrains Mono,monospace;font-size:.7rem">${log.registroId}</td>
                <td style="font-size:.8rem;color:var(--text2)">${escapeHtml(log.detalles)}</td>
                <td>
                    ${currentUserRole === 'admin' ? 
                        `<button class="btn-sm btn-del" onclick="deleteAuditLogEntry(${log.id}, '${displayUser}')" style="background:rgba(248,113,113,0.15)">
                            <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            Eliminar
                        </button>` : 
                        `<span style="color:var(--text3);font-size:.7rem">—</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

function filterAudit() {
    const searchInput = document.getElementById('auditSearchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const selectedUser = document.getElementById('auditUserSelect')?.value || '';
    let auditData = [];
    
    if (currentUserRole === 'admin' && selectedUser) {
        auditData = allAuditLogs[selectedUser] || [];
    } else if (currentUserRole === 'admin' && !selectedUser) {
        for (const [username, logs] of Object.entries(allAuditLogs)) {
            if (logs && logs.length) {
                auditData.push(...logs.map(log => ({ ...log, usuarioOriginal: username })));
            }
        }
    } else {
        auditData = window.auditLog || [];
    }
    
    const filtered = auditData.filter(log => {
        const displayUser = log.usuarioOriginal || log.usuario;
        return displayUser.toLowerCase().includes(query) ||
            log.accion.toLowerCase().includes(query) ||
            log.detalles.toLowerCase().includes(query);
    });
    
    const tbody = document.getElementById('auditTableBody');
    const empty = document.getElementById('emptyAudit');
    
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
        
        const displayUser = log.usuarioOriginal || log.usuario;
        
        return `
            <tr>
                <td style="font-size:.78rem;color:var(--text2)">${log.fechaHora}</td>
                <td style="font-weight:500">${escapeHtml(displayUser)}</td>
                <td><span class="audit-badge ${actionClass}">${log.accion}</span></td>
                <td style="font-family:JetBrains Mono,monospace;font-size:.7rem">${log.registroId}</td>
                <td style="font-size:.8rem;color:var(--text2)">${escapeHtml(log.detalles)}</td>
                <td>
                    ${currentUserRole === 'admin' ? 
                        `<button class="btn-sm btn-del" onclick="deleteAuditLogEntry(${log.id}, '${displayUser}')" style="background:rgba(248,113,113,0.15)">
                            <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            Eliminar
                        </button>` : 
                        `<span style="color:var(--text3);font-size:.7rem">—</span>`
                    }
                </td>
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
    const savedRole = localStorage.getItem('glassroom_current_role');
    
    if (savedUser) {
        currentUser = savedUser;
        currentUserRole = savedRole || 'user';
        
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        const currentUserSpan = document.getElementById('currentUser');
        const adminTab = document.getElementById('tab-admin');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) {
            mainApp.style.display = 'block';
            if (currentUserSpan) currentUserSpan.textContent = currentUser;
            if (adminTab) adminTab.style.display = currentUserRole === 'admin' ? 'inline-flex' : 'none';
            setupRealtimeSync();
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkExistingSession);
} else {
    checkExistingSession();
}
