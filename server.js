// =====================================================
// IMPORTS
// =====================================================
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');

// =====================================================
// CONFIG
// =====================================================
const app = express();

if (!fs.existsSync('./database')) fs.mkdirSync('./database');
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// =====================================================
// BANCO DE DADOS
// =====================================================
const db = new Database('./database/os.db');

// =====================================================
// MULTER
// =====================================================
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Apenas arquivos PDF são aceitos'));
    }
});

// =====================================================
// TABELAS
// =====================================================
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'tecnico',
    trocar_senha INTEGER DEFAULT 1
)
`);

db.exec(`
CREATE TABLE IF NOT EXISTS ordens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_chamado TEXT,
    nome TEXT NOT NULL,
    cartorio TEXT NOT NULL,
    equipamento TEXT NOT NULL,
    patrimonio TEXT NOT NULL,
    descricao TEXT NOT NULL,
    data_retirada TEXT NOT NULL,
    tecnico TEXT NOT NULL,
    paragrafo_reparo INTEGER DEFAULT 0,
    paragrafo_substituicao INTEGER DEFAULT 0,
    patrimonio_novo TEXT,
    status TEXT DEFAULT 'aberta',
    data_devolucao TEXT,
    pdf_assinado TEXT
)
`);

db.exec(`
CREATE TABLE IF NOT EXISTS inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento TEXT NOT NULL,
    patrimonio TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'funcionando',
    numero_chamado TEXT,
    cartorio TEXT NOT NULL,
    data_atualizacao TEXT NOT NULL,
    modificado_por TEXT NOT NULL
)
`);

// =====================================================
// HELPERS
// =====================================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatarData(d) {
    if (!d) return '—';
    return d.split('-').reverse().join('/');
}

function badgeStatus(status) {
    const badges = {
        'aberta':           { cls: 'badge-aberta',     label: '● Aberta' },
        'assinada':         { cls: 'badge-assinada',   label: '● Assinada' },
        'aguardando_chefe': { cls: 'badge-aguardando', label: '● Aguardando Chefe' },
        'concluida':        { cls: 'badge-concluida',  label: '● Concluída' }
    };
    const b = badges[status] || badges['aberta'];
    return `<span class="badge ${b.cls}">${b.label}</span>`;
}

function badgeInventario(status) {
    const badges = {
        'funcionando':        { cls: 'badge-concluida',  label: '● Funcionando' },
        'aguardando_chamado': { cls: 'badge-aberta',     label: '● Aguardando Chamado' },
        'em_manutencao':      { cls: 'badge-manutencao', label: '● Em Manutenção' },
        'emprestado':         { cls: 'badge-assinada',   label: '● Emprestado' },
        'enviado_conserto':   { cls: 'badge-aguardando', label: '● Enviado p/ Conserto' },
        'descartado':         { cls: 'badge-descartado', label: '● Descartado' }
    };
    const b = badges[status] || badges['funcionando'];
    return `<span class="badge ${b.cls}">${b.label}</span>`;
}

function quebrarTexto(texto, maxChars) {
    const palavras = texto.split(' ');
    const linhas = [];
    let linhaAtual = '';
    for (const palavra of palavras) {
        if ((linhaAtual + ' ' + palavra).trim().length <= maxChars) {
            linhaAtual = (linhaAtual + ' ' + palavra).trim();
        } else {
            if (linhaAtual) linhas.push(linhaAtual);
            linhaAtual = palavra;
        }
    }
    if (linhaAtual) linhas.push(linhaAtual);
    return linhas;
}

function layout({ titulo, conteudo, usuario, paginaAtiva = '' }) {
    const primeiroNome = escapeHtml(usuario.nome.split(' ')[0]);
    const tipoLabel = usuario.tipo === 'admin' ? 'Administrador' : 'Técnico';
    const inicial = primeiroNome.charAt(0).toUpperCase();
    const navItems = [
        { href: '/painel',     label: 'Início',      id: 'painel' },
        { href: '/lista',      label: 'Lista de OS', id: 'lista' },
        { href: '/nova-os',    label: '+ Criar OS',  id: 'nova-os' },
        { href: '/inventario', label: 'Inventário',  id: 'inventario' }
    ];
    const navHtml = navItems.map(item => `
        <a href="${item.href}" class="nav-item${paginaAtiva === item.id ? ' active' : ''}">
            ${escapeHtml(item.label)}
        </a>
    `).join('');
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(titulo)} - IT2B</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="app-layout">
    <aside class="sidebar">
        <div class="sidebar-logo">
            <img src="/IT2B IMG.png" alt="IT2B" onerror="this.style.display='none'">
            <span class="sidebar-brand">IT2B</span>
        </div>
        <nav class="sidebar-nav">
            <div class="nav-section-label">Ordem de Serviço</div>
            ${navHtml}
        </nav>
        <div class="sidebar-footer">
            TJSP — Comarca de Caraguatatuba
        </div>
    </aside>
    <div class="main-wrapper">
        <header class="topbar">
            <div class="topbar-left">
                <span class="topbar-title">Ordem de Serviço</span>
            </div>
            <div class="topbar-right">
                <div class="user-pill">
                    <div class="user-avatar">${inicial}</div>
                    <div class="user-details">
                        <span class="user-greeting">Olá, ${primeiroNome}</span>
                        <span class="user-role">${tipoLabel}</span>
                    </div>
                </div>
                <a href="/logout" class="btn-logout">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sair
                </a>
            </div>
        </header>
        <main class="content">
            ${conteudo}
        </main>
    </div>
</body>
</html>`;
}

// =====================================================
// MIDDLEWARES
// =====================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'it2b_tjsp_secret_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =====================================================
// USUÁRIOS PADRÃO
// =====================================================
async function criarUsuariosPadrao() {
    const usuarios = [
        { nome: 'Saulo Levy Lima Martins',  usuario: 'saulollm@tjsp.jus.br',          senha: '123456', tipo: 'admin' },
        { nome: 'Anderson Marques Farias',  usuario: 'anderson.mfarias@tjsp.jus.br',   senha: '12345',  tipo: 'tecnico' }
    ];
    for (const u of usuarios) {
        const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u.usuario);
        if (!existe) {
            const hash = await bcrypt.hash(u.senha, 10);
            db.prepare(`
                INSERT INTO usuarios (nome, usuario, senha, tipo, trocar_senha)
                VALUES (?, ?, ?, ?, 1)
            `).run(u.nome, u.usuario, hash, u.tipo);
            console.log(`[OK] Usuário criado: ${u.usuario}`);
        }
    }
}
criarUsuariosPadrao().catch(console.error);

// =====================================================
// MIDDLEWARE DE AUTH
// =====================================================
function verificarLogin(req, res, next) {
    if (!req.session.usuario) return res.redirect('/login');
    next();
}

function verificarTrocaSenha(req, res, next) {
    if (req.session.usuario && req.session.usuario.trocar_senha) {
        return res.redirect('/trocar-senha');
    }
    next();
}

// =====================================================
// ROTAS LOGIN
// =====================================================
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login — IT2B</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="login-body">
    <div class="login-card">
        <div class="login-logo">
            <img src="/IT2B IMG.png" alt="IT2B" onerror="this.style.display='none'">
            <span class="login-brand">IT2B</span>
        </div>
        <h2 class="login-title">Acesso ao Sistema</h2>
        <script>
            const params = new URLSearchParams(window.location.search);
            const erro = params.get('erro');
            if (erro === 'senha') {
                document.addEventListener('DOMContentLoaded', () => {
                    const el = document.createElement('div');
                    el.className = 'login-erro';
                    el.textContent = '⚠️ Senha incorreta. Verifique e tente novamente.';
                    document.querySelector('.login-form').before(el);
                });
            } else if (erro === 'sem_permissao') {
                document.addEventListener('DOMContentLoaded', () => {
                    const el = document.createElement('div');
                    el.className = 'login-erro login-erro-bloqueado';
                    el.textContent = '🚫 Acesso negado. Você não tem permissão para acessar este sistema.';
                    document.querySelector('.login-form').before(el);
                });
            }
        </script>
        <form action="/login" method="POST" class="login-form">
            <div class="form-group">
                <label>Usuário</label>
                <input type="text" name="usuario" placeholder="seu@email.com" required autofocus>
            </div>
            <div class="form-group">
                <label>Senha</label>
                <input type="password" name="senha" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-login">Entrar</button>
        </form>
        <a href="/esqueceu-senha" class="login-forgot">Esqueceu sua senha?</a>
        <div class="login-footer">🏛️ Tribunal de Justiça do Estado de São Paulo</div>
    </div>
</body>
</html>`);
});

app.post('/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const usuariosPermitidos = ['saulollm@tjsp.jus.br', 'anderson.farias@tjsp.jus.br'];
        if (!usuariosPermitidos.includes(usuario)) {
            return res.redirect('/login?erro=sem_permissao');
        }
        const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
        if (!user) return res.redirect('/login?erro=sem_permissao');
        const ok = await bcrypt.compare(senha, user.senha);
        if (!ok) return res.redirect('/login?erro=senha');
        req.session.usuario = user;
        if (user.trocar_senha) return res.redirect('/trocar-senha');
        res.redirect('/painel');
    } catch (err) {
        console.error('[ERRO] Login:', err);
        res.status(500).send('Erro ao realizar login.');
    }
});

app.get('/trocar-senha', verificarLogin, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Trocar Senha — IT2B</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="trocar-body">
    <div class="trocar-card">
        <div class="trocar-icon">🔒</div>
        <h2>Troque sua senha</h2>
        <p class="trocar-desc">Por segurança, você precisa definir uma nova senha antes de continuar.</p>
        <form action="/trocar-senha" method="POST" class="login-form">
            <div class="form-group">
                <label>Nova Senha</label>
                <input type="password" name="nova_senha" placeholder="Nova senha" required>
            </div>
            <div class="form-group">
                <label>Confirmar Senha</label>
                <input type="password" name="confirmar_senha" placeholder="Confirme a nova senha" required>
            </div>
            <button type="submit" class="btn-login">Salvar Nova Senha</button>
        </form>
        <div class="trocar-footer">🏛️ Tribunal de Justiça do Estado de São Paulo</div>
    </div>
</body>
</html>`);
});

app.post('/trocar-senha', verificarLogin, async (req, res) => {
    try {
        const { nova_senha, confirmar_senha } = req.body;
        if (nova_senha !== confirmar_senha) return res.redirect('/trocar-senha?erro=1');
        const hash = await bcrypt.hash(nova_senha, 10);
        db.prepare('UPDATE usuarios SET senha = ?, trocar_senha = 0 WHERE id = ?')
            .run(hash, req.session.usuario.id);
        req.session.usuario.trocar_senha = 0;
        res.redirect('/painel');
    } catch (err) {
        console.error('[ERRO] Trocar senha:', err);
        res.status(500).send('Erro ao trocar senha.');
    }
});

app.get('/esqueceu-senha', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Esqueceu a Senha — IT2B</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="trocar-body">
    <div class="trocar-card" style="text-align:center">
        <div class="trocar-icon">🔑</div>
        <h2>Esqueceu sua senha?</h2>
        <p class="trocar-desc">Consulte o Administrador do sistema para realizar o reset de senha.</p>
        <div class="admin-info-box">
            <strong>Administrador</strong>
            <span>Saulo Levy Lima Martins</span>
            <a href="mailto:saulollm@tjsp.jus.br">saulollm@tjsp.jus.br</a>
        </div>
        <a href="/login" class="btn-login" style="text-decoration:none;justify-content:center">← Voltar ao Login</a>
        <div class="trocar-footer">🏛️ Tribunal de Justiça do Estado de São Paulo</div>
    </div>
</body>
</html>`);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// =====================================================
// PAINEL
// =====================================================
app.get('/painel', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const usuario = req.session.usuario;
        const primeiroNome = escapeHtml(usuario.nome.split(' ')[0]);
        const stats = {
            abertas:    db.prepare("SELECT COUNT(*) as n FROM ordens WHERE status = 'aberta'").get().n,
            andamento:  db.prepare("SELECT COUNT(*) as n FROM ordens WHERE status IN ('assinada','aguardando_chefe')").get().n,
            concluidas: db.prepare("SELECT COUNT(*) as n FROM ordens WHERE status = 'concluida'").get().n,
            total:      db.prepare("SELECT COUNT(*) as n FROM ordens").get().n
        };
        const conteudo = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Bem-vindo, ${primeiroNome}!</h1>
                    <p class="page-subtitle">O que você deseja fazer?</p>
                </div>
            </div>
            <div class="painel-cards">
                <a href="/lista" class="painel-card painel-card-lista">
                    <div class="painel-card-icon">📋</div>
                    <div class="painel-card-content">
                        <h3>Lista de Ordem de Serviço</h3>
                        <p>Visualize e acompanhe todas as ordens de serviço cadastradas no sistema.</p>
                        <div class="painel-card-btn">Acessar →</div>
                    </div>
                </a>
                <a href="/nova-os" class="painel-card painel-card-nova">
                    <div class="painel-card-icon">📝</div>
                    <div class="painel-card-content">
                        <h3>Criar Ordem de Serviço</h3>
                        <p>Registre uma nova ordem de serviço informando os dados do equipamento e a solicitação.</p>
                        <div class="painel-card-btn">Criar nova OS →</div>
                    </div>
                </a>
            </div>
            <div class="stats-row">
                <div class="stat-card">
                    <div class="stat-icon">📋</div>
                    <div class="stat-number">${stats.abertas}</div>
                    <div class="stat-label">OS Abertas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🔧</div>
                    <div class="stat-number">${stats.andamento}</div>
                    <div class="stat-label">Em Andamento</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-number">${stats.concluidas}</div>
                    <div class="stat-label">Concluídas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📁</div>
                    <div class="stat-number">${stats.total}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>
        `;
        res.send(layout({ titulo: 'Painel', conteudo, usuario, paginaAtiva: 'painel' }));
    } catch (err) {
        console.error('[ERRO] Painel:', err);
        res.status(500).send('Erro ao carregar painel.');
    }
});

// =====================================================
// ROTAS — NOVA OS
// =====================================================
app.get('/nova-os', verificarLogin, verificarTrocaSenha, (req, res) => {
    const usuario = req.session.usuario;
    const tecnicoNome = escapeHtml(usuario.nome);
    const conteudo = `
        <div class="page-header">
            <div>
                <h1 class="page-title">Nova Ordem de Serviço</h1>
                <p class="page-subtitle">Preencha os dados abaixo para registrar uma nova OS.</p>
            </div>
            <a href="/lista" class="btn-secondary">← Voltar à Lista</a>
        </div>
        <div class="card">
            <form action="/os" method="POST" class="form-grid">
                <div class="form-group">
                    <label>Número do Chamado</label>
                    <input type="text" name="numero_chamado" placeholder="Ex: CH-2025-001">
                </div>
                <div class="form-group">
                    <label>Responsável do Cartório <span class="required">*</span></label>
                    <input type="text" name="nome" placeholder="Nome completo do responsável" required>
                </div>
                <div class="form-group">
                    <label>Cartório <span class="required">*</span></label>
                    <input type="text" name="cartorio" placeholder="Ex: 1ª Vara Cível" required>
                </div>
                <div class="form-group">
                    <label>Equipamento <span class="required">*</span></label>
                    <input type="text" name="equipamento" placeholder="Ex: Notebook, Desktop, Impressora" required>
                </div>
                <div class="form-group">
                    <label>Número de Patrimônio <span class="required">*</span></label>
                    <input type="text" name="patrimonio" placeholder="Ex: TJSP-000123" required>
                </div>
                <div class="form-group">
                    <label>Data de Retirada <span class="required">*</span></label>
                    <input type="date" name="data_retirada" required>
                </div>
                <div class="form-group full-width">
                    <label>Descrição do Problema <span class="required">*</span></label>
                    <textarea name="descricao" placeholder="Descreva o problema ou serviço a ser realizado..." required rows="4"></textarea>
                </div>
                <div class="form-group">
                    <label>Técnico Responsável <span class="required">*</span></label>
                    <input type="text" name="tecnico" value="${tecnicoNome}" required>
                </div>
                <div class="form-group full-width">
                    <label style="text-transform:none;letter-spacing:0">Parágrafos Adicionais no PDF</label>
                    <div class="checkboxes">
                        <label class="checkbox-label">
                            <input type="checkbox" name="paragrafo_reparo" value="1">
                            <span>Incluir parágrafo de devolução por reparo</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="paragrafo_substituicao" value="1" id="chk-substituicao">
                            <span>Incluir parágrafo de substituição de equipamento</span>
                        </label>
                    </div>
                </div>
                <div class="form-group full-width" id="campo-patrimonio-novo" style="display:none">
                    <label>Patrimônio do Novo Equipamento</label>
                    <input type="text" name="patrimonio_novo" placeholder="Número de patrimônio do equipamento substituto">
                </div>
                <div class="form-group full-width form-actions">
                    <button type="submit" class="btn-primary">✓ Criar Ordem de Serviço</button>
                    <a href="/lista" class="btn-secondary">Cancelar</a>
                </div>
            </form>
        </div>
        <script>
            document.getElementById('chk-substituicao').addEventListener('change', function() {
                document.getElementById('campo-patrimonio-novo').style.display = this.checked ? 'block' : 'none';
            });
        </script>
    `;
    res.send(layout({ titulo: 'Nova OS', conteudo, usuario, paginaAtiva: 'nova-os' }));
});

app.post('/os', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const {
            numero_chamado, nome, cartorio, equipamento,
            patrimonio, descricao, data_retirada, tecnico,
            paragrafo_reparo, paragrafo_substituicao, patrimonio_novo
        } = req.body;

        const result = db.prepare(`
            INSERT INTO ordens (
                numero_chamado, nome, cartorio, equipamento,
                patrimonio, descricao, data_retirada, tecnico,
                paragrafo_reparo, paragrafo_substituicao, patrimonio_novo, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta')
        `).run(
            numero_chamado || null, nome, cartorio, equipamento,
            patrimonio, descricao, data_retirada, tecnico,
            paragrafo_reparo ? 1 : 0,
            paragrafo_substituicao ? 1 : 0,
            patrimonio_novo || null
        );

        const data = new Date().toLocaleDateString('pt-BR');
        const existente = db.prepare('SELECT * FROM inventario WHERE patrimonio = ?').get(patrimonio);
        if (existente) {
            db.prepare(`
                UPDATE inventario SET
                    status = 'em_manutencao',
                    numero_chamado = ?,
                    data_atualizacao = ?,
                    modificado_por = ?
                WHERE patrimonio = ?
            `).run(numero_chamado || null, data, tecnico, patrimonio);
        } else {
            db.prepare(`
                INSERT INTO inventario (equipamento, patrimonio, cartorio, numero_chamado, status, data_atualizacao, modificado_por)
                VALUES (?, ?, ?, ?, 'em_manutencao', ?, ?)
            `).run(equipamento, patrimonio, cartorio, numero_chamado || null, data, tecnico);
        }

        res.redirect(`/os/${result.lastInsertRowid}`);
    } catch (err) {
        console.error('[ERRO] Criar OS:', err);
        res.status(500).send('Erro interno ao criar OS.');
    }
});

// =====================================================
// ROTAS — LISTA DE OS
// =====================================================
app.get('/lista', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const usuario = req.session.usuario;
        const ordens = db.prepare('SELECT * FROM ordens ORDER BY id DESC').all();
        const cards = ordens.map(os => `
            <div class="os-card" data-status="${os.status}" data-texto="${escapeHtml(os.patrimonio + ' ' + os.equipamento + ' ' + os.cartorio).toLowerCase()}">
                <div class="os-card-header">
                    <span class="os-card-num">OS #${escapeHtml(String(os.id))}</span>
                    ${badgeStatus(os.status)}
                </div>
                <div class="os-card-body">
                    <p><strong>Equipamento:</strong> ${escapeHtml(os.equipamento)}</p>
                    <p><strong>Patrimônio:</strong> ${escapeHtml(os.patrimonio)}</p>
                    <p><strong>Cartório:</strong> ${escapeHtml(os.cartorio)}</p>
                    <p><strong>Técnico:</strong> ${escapeHtml(os.tecnico)}</p>
                </div>
                <div class="os-card-footer">
                    <a href="/os/${os.id}" class="btn-primary btn-sm">Abrir →</a>
                </div>
            </div>
        `).join('');
        const conteudo = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Lista de Ordem de Serviço</h1>
                    <p class="page-subtitle">Acompanhe todas as ordens de serviço registradas no sistema.</p>
                </div>
                <div class="stat-badge-inline">
                    <span class="stat-badge-icon">📋</span>
                    <span class="stat-badge-num">${ordens.length}</span>
                    <span class="stat-badge-lbl">Total de OS</span>
                </div>
            </div>
            <div class="filters-bar">
                <input type="text" id="busca" placeholder="🔍 Buscar por patrimônio, equipamento ou cartório..." class="search-input" oninput="filtrar()">
                <select id="filtro-status" class="filter-select" onchange="filtrar()">
                    <option value="">Todos os status</option>
                    <option value="aberta">Aberta</option>
                    <option value="assinada">Assinada</option>
                    <option value="aguardando_chefe">Aguardando Chefe</option>
                    <option value="concluida">Concluída</option>
                </select>
                <a href="/nova-os" class="btn-primary">+ Nova OS</a>
            </div>
            <div id="lista-os">
                ${cards || '<div class="empty-state"><p>Nenhuma OS cadastrada ainda.</p><a href="/nova-os" class="btn-primary" style="margin-top:1rem">Criar primeira OS</a></div>'}
            </div>
            <a href="/painel" class="btn-secondary mt-2">← Voltar ao Painel</a>
            <script>
                function filtrar() {
                    const busca = document.getElementById('busca').value.toLowerCase();
                    const status = document.getElementById('filtro-status').value;
                    document.querySelectorAll('.os-card').forEach(card => {
                        const texto = card.dataset.texto || '';
                        const cardStatus = card.dataset.status;
                        card.style.display =
                            (!busca || texto.includes(busca)) &&
                            (!status || cardStatus === status) ? '' : 'none';
                    });
                }
            </script>
        `;
        res.send(layout({ titulo: 'Lista de OS', conteudo, usuario, paginaAtiva: 'lista' }));
    } catch (err) {
        console.error('[ERRO] Lista:', err);
        res.status(500).send('Erro ao listar OS.');
    }
});

// =====================================================
// ROTAS — VISUALIZAR OS
// =====================================================
app.get('/os/:id', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const usuario = req.session.usuario;
        const os = db.prepare('SELECT * FROM ordens WHERE id = ?').get(req.params.id);
        if (!os) return res.status(404).send('OS não encontrada.');
        const fluxo = {
            'aberta':           { valor: 'assinada',         label: '🔵 Marcar como Assinada por mim' },
            'assinada':         { valor: 'aguardando_chefe', label: '🟠 Enviar para o Chefe' },
            'aguardando_chefe': { valor: 'concluida',        label: '✅ Marcar como Concluída' },
            'concluida':        null
        };
        const prox = fluxo[os.status];
        const conteudo = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">OS #${escapeHtml(String(os.id))}</h1>
                    <p class="page-subtitle">${badgeStatus(os.status)}</p>
                </div>
                <div class="page-header-actions">
                    <a href="/gerar-pdf/${os.id}" class="btn-primary" target="_blank">📄 Gerar PDF</a>
                    <a href="/os/${os.id}/editar" class="btn-secondary">✏ Editar</a>
                    <a href="/lista" class="btn-secondary">← Lista</a>
                </div>
            </div>
            <div class="card">
                <h2 class="card-title">Dados da OS</h2>
                <div class="info-grid">
                    <div class="info-item"><label>OS Nº</label><p>#${escapeHtml(String(os.id))}</p></div>
                    <div class="info-item"><label>Chamado</label><p>${escapeHtml(os.numero_chamado) || '—'}</p></div>
                    <div class="info-item"><label>Responsável</label><p>${escapeHtml(os.nome)}</p></div>
                    <div class="info-item"><label>Cartório</label><p>${escapeHtml(os.cartorio)}</p></div>
                    <div class="info-item"><label>Equipamento</label><p>${escapeHtml(os.equipamento)}</p></div>
                    <div class="info-item"><label>Patrimônio</label><p>${escapeHtml(os.patrimonio)}</p></div>
                    <div class="info-item"><label>Data de Retirada</label><p>${formatarData(os.data_retirada)}</p></div>
                    <div class="info-item"><label>Técnico</label><p>${escapeHtml(os.tecnico)}</p></div>
                    <div class="info-item full-span"><label>Descrição</label><p>${escapeHtml(os.descricao)}</p></div>
                </div>
                ${os.paragrafo_reparo    ? `<div class="tag-info">✅ Inclui devolução por reparo</div>` : ''}
                ${os.paragrafo_substituicao ? `<div class="tag-info">✅ Substituição — Patrimônio novo: ${escapeHtml(os.patrimonio_novo) || '—'}</div>` : ''}
            </div>
            <div class="two-col">
                ${prox ? `
                <div class="card">
                    <h2 class="card-title">Avançar Status</h2>
                    <form action="/status/${os.id}" method="POST">
                        <input type="hidden" name="status" value="${prox.valor}">
                        <button type="submit" class="btn-primary">${prox.label}</button>
                    </form>
                </div>` : `
                <div class="card card-success">
                    <h2 class="card-title">✅ OS Concluída</h2>
                    <p style="color:#0f5132;font-weight:500">Esta ordem de serviço foi concluída.</p>
                </div>`}
                <div class="card">
                    <h2 class="card-title">PDF Assinado</h2>
                    <div class="pdf-status">
                        <span class="badge ${os.pdf_assinado ? 'badge-concluida' : 'badge-aberta'}">
                            ${os.pdf_assinado ? '✅ PDF Enviado' : '⏳ Pendente'}
                        </span>
                        ${os.pdf_assinado ? `<a href="/uploads/${escapeHtml(os.pdf_assinado)}" target="_blank" class="btn-link-inline">Baixar PDF</a>` : ''}
                    </div>
                    <form action="/upload/${os.id}" method="POST" enctype="multipart/form-data" class="upload-form">
                        <div class="form-group">
                            <label>Data de Devolução</label>
                            <input type="date" name="data_devolucao">
                        </div>
                        <div class="form-group">
                            <label>PDF Assinado</label>
                            <input type="file" name="pdf" accept=".pdf" required>
                        </div>
                        <button type="submit" class="btn-primary">Enviar PDF</button>
                    </form>
                </div>
            </div>
        `;
        res.send(layout({ titulo: `OS #${os.id}`, conteudo, usuario, paginaAtiva: 'lista' }));
    } catch (err) {
        console.error('[ERRO] Visualizar OS:', err);
        res.status(500).send('Erro ao visualizar OS.');
    }
});

// =====================================================
// ROTAS — EDITAR OS
// =====================================================
app.get('/os/:id/editar', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const usuario = req.session.usuario;
        const os = db.prepare('SELECT * FROM ordens WHERE id = ?').get(req.params.id);
        if (!os) return res.status(404).send('OS não encontrada.');
        const conteudo = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Editar OS #${escapeHtml(String(os.id))}</h1>
                    <p class="page-subtitle">Atualize os dados da ordem de serviço.</p>
                </div>
                <a href="/os/${os.id}" class="btn-secondary">← Voltar</a>
            </div>
            <div class="card">
                <form action="/os/${os.id}/editar" method="POST" class="form-grid">
                    <div class="form-group">
                        <label>Número do Chamado</label>
                        <input type="text" name="numero_chamado" value="${escapeHtml(os.numero_chamado) || ''}">
                    </div>
                    <div class="form-group">
                        <label>Responsável <span class="required">*</span></label>
                        <input type="text" name="nome" value="${escapeHtml(os.nome)}" required>
                    </div>
                    <div class="form-group">
                        <label>Cartório <span class="required">*</span></label>
                        <input type="text" name="cartorio" value="${escapeHtml(os.cartorio)}" required>
                    </div>
                    <div class="form-group">
                        <label>Equipamento <span class="required">*</span></label>
                        <input type="text" name="equipamento" value="${escapeHtml(os.equipamento)}" required>
                    </div>
                    <div class="form-group">
                        <label>Patrimônio <span class="required">*</span></label>
                        <input type="text" name="patrimonio" value="${escapeHtml(os.patrimonio)}" required>
                    </div>
                    <div class="form-group">
                        <label>Data de Retirada <span class="required">*</span></label>
                        <input type="date" name="data_retirada" value="${escapeHtml(os.data_retirada)}" required>
                    </div>
                    <div class="form-group full-width">
                        <label>Descrição <span class="required">*</span></label>
                        <textarea name="descricao" required rows="4">${escapeHtml(os.descricao)}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Técnico <span class="required">*</span></label>
                        <input type="text" name="tecnico" value="${escapeHtml(os.tecnico)}" required>
                    </div>
                    <div class="form-group full-width">
                        <label style="text-transform:none;letter-spacing:0">Parágrafos no PDF</label>
                        <div class="checkboxes">
                            <label class="checkbox-label">
                                <input type="checkbox" name="paragrafo_reparo" value="1" ${os.paragrafo_reparo ? 'checked' : ''}>
                                <span>Incluir parágrafo de devolução por reparo</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="paragrafo_substituicao" value="1" id="chk-sub" ${os.paragrafo_substituicao ? 'checked' : ''}>
                                <span>Incluir parágrafo de substituição de equipamento</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group full-width" id="campo-pat-novo" style="display:${os.paragrafo_substituicao ? 'block' : 'none'}">
                        <label>Patrimônio do Novo Equipamento</label>
                        <input type="text" name="patrimonio_novo" value="${escapeHtml(os.patrimonio_novo) || ''}">
                    </div>
                    <div class="form-group full-width form-actions">
                        <button type="submit" class="btn-primary">Salvar Alterações</button>
                        <a href="/os/${os.id}" class="btn-secondary">Cancelar</a>
                    </div>
                </form>
            </div>
            <script>
                document.getElementById('chk-sub').addEventListener('change', function() {
                    document.getElementById('campo-pat-novo').style.display = this.checked ? 'block' : 'none';
                });
            </script>
        `;
        res.send(layout({ titulo: `Editar OS #${os.id}`, conteudo, usuario, paginaAtiva: 'lista' }));
    } catch (err) {
        console.error('[ERRO] Form editar OS:', err);
        res.status(500).send('Erro ao carregar formulário.');
    }
});

app.post('/os/:id/editar', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const {
            numero_chamado, nome, cartorio, equipamento,
            patrimonio, descricao, data_retirada, tecnico,
            paragrafo_reparo, paragrafo_substituicao, patrimonio_novo
        } = req.body;
        db.prepare(`
            UPDATE ordens SET
                numero_chamado = ?, nome = ?, cartorio = ?, equipamento = ?,
                patrimonio = ?, descricao = ?, data_retirada = ?, tecnico = ?,
                paragrafo_reparo = ?, paragrafo_substituicao = ?, patrimonio_novo = ?
            WHERE id = ?
        `).run(
            numero_chamado || null, nome, cartorio, equipamento,
            patrimonio, descricao, data_retirada, tecnico,
            paragrafo_reparo ? 1 : 0,
            paragrafo_substituicao ? 1 : 0,
            patrimonio_novo || null,
            req.params.id
        );
        res.redirect(`/os/${req.params.id}`);
    } catch (err) {
        console.error('[ERRO] Salvar edição OS:', err);
        res.status(500).send('Erro ao salvar alterações.');
    }
});

// =====================================================
// ROTAS — ATUALIZAR STATUS
// =====================================================
app.post('/status/:id', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const { status } = req.body;
        db.prepare('UPDATE ordens SET status = ? WHERE id = ?').run(status, req.params.id);
        res.redirect(`/os/${req.params.id}`);
    } catch (err) {
        console.error('[ERRO] Status:', err);
        res.status(500).send('Erro ao atualizar status.');
    }
});

// =====================================================
// ROTAS — UPLOAD PDF ASSINADO
// =====================================================
app.post('/upload/:id', verificarLogin, verificarTrocaSenha, upload.single('pdf'), (req, res) => {
    try {
        if (!req.file) return res.redirect(`/os/${req.params.id}?erro=arquivo`);
        const filename = `os-${req.params.id}-assinada.pdf`;
        const finalPath = path.join(__dirname, 'uploads', filename);
        fs.renameSync(req.file.path, finalPath);
        const data_devolucao = req.body.data_devolucao || null;
        db.prepare(`
            UPDATE ordens SET pdf_assinado = ?, data_devolucao = ? WHERE id = ?
        `).run(filename, data_devolucao, req.params.id);
        res.redirect(`/os/${req.params.id}`);
    } catch (err) {
        console.error('[ERRO] Upload PDF:', err);
        res.status(500).send('Erro ao fazer upload do PDF.');
    }
});

// =====================================================
// ROTAS — GERAR PDF
// =====================================================
app.get('/gerar-pdf/:id', verificarLogin, async (req, res) => {
    try {
        const os = db.prepare('SELECT * FROM ordens WHERE id = ?').get(req.params.id);
        if (!os) return res.status(404).send('OS não encontrada.');

        const formatarData = (data) => {
            if (!data) return '';
            const [ano, mes, dia] = data.split('-');
            return `${dia}/${mes}/${ano}`;
        };

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595, 842]);
        const { height } = page.getSize();
        const form = pdfDoc.getForm();

        const fontBold     = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontNormal   = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontOblique  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const fontTimes    = await pdfDoc.embedFont(StandardFonts.TimesRoman);

        // LOGO
        const logoPath = path.join(__dirname, 'public', 'IT2B IMG.png');
        if (fs.existsSync(logoPath)) {
            const logoBytes = fs.readFileSync(logoPath);
            const logoImage = await pdfDoc.embedPng(logoBytes);
            page.drawImage(logoImage, { x: 420, y: height - 90, width: 120, height: 65 });
        }

        // TÍTULO
        page.drawText('OS DE EQUIPAMENTOS', {
            x: 130, y: height - 55, font: fontBold, size: 16, color: rgb(0, 0, 0)
        });

        // SUBTÍTULO
        page.drawText('Tribunal de Justiça do Estado de São Paulo', {
            x: 110, y: height - 73, font: fontBold, size: 12, color: rgb(0, 0, 0)
        });

        // COMARCA
        page.drawText('Comarca de Caraguatatuba', {
            x: 185, y: height - 89, font: fontOblique, size: 11, color: rgb(0, 0, 0)
        });

        // OS Nº e CHAMADO
        page.drawText(`OS Nº: ${os.id}${os.numero_chamado ? `          Chamado: ${os.numero_chamado}` : ''}`, {
            x: 50, y: height - 120, font: fontNormal, size: 10, color: rgb(0, 0, 0)
        });

        // 1º PARÁGRAFO
        const paragrafo1 = `Declaro estar ciente de que o equipamento ${os.equipamento.toUpperCase()}, de patrimônio nº ${os.patrimonio}, pertence a ${os.cartorio.toUpperCase()}, na data ${formatarData(os.data_retirada)} para fins de manutenção.`;

        const words = paragrafo1.split(' ');
        let line = '';
        let y = height - 160;
        const maxWidth = 495;

        for (const word of words) {
            const testLine = line + word + ' ';
            const testWidth = fontTimes.widthOfTextAtSize(testLine, 11);
            if (testWidth > maxWidth && line !== '') {
                page.drawText(line.trim(), { x: 50, y, font: fontTimes, size: 11, color: rgb(0, 0, 0) });
                y -= 16;
                line = word + ' ';
            } else {
                line = testLine;
            }
        }
        page.drawText(line.trim(), { x: 50, y, font: fontTimes, size: 11, color: rgb(0, 0, 0) });

        // ASSINATURA TÉCNICO
        page.drawLine({ start: { x: 310, y: height - 250 }, end: { x: 545, y: height - 250 }, thickness: 0.5, color: rgb(0,0,0) });
        page.drawText(`Técnico: ${os.tecnico}`, { x: 310, y: height - 263, font: fontTimesBold, size: 9, color: rgb(0,0,0) });
        page.drawText('Assinatura do Técnico Responsável - IT2B', { x: 310, y: height - 275, font: fontTimes, size: 8, color: rgb(0,0,0) });

        let currentY = height - 380;

        // 2º PARÁGRAFO — Reparo (sempre visível, checkbox marca qual se aplica)
        const checkbox1 = form.createCheckBox('reparo');
        checkbox1.addToPage(page, { x: 50, y: currentY - 4, width: 12, height: 12 });
        if (os.paragrafo_reparo) checkbox1.check();
        page.drawText('Declaro que recebi o equipamento acima identificado devidamente funcionando.', {
            x: 70, y: currentY, font: fontNormal, size: 11, color: rgb(0,0,0)
        });
        currentY -= 35;

        // 3º PARÁGRAFO — Substituição (sempre visível, checkbox marca qual se aplica)
        const checkbox2 = form.createCheckBox('substituicao');
        checkbox2.addToPage(page, { x: 50, y: currentY - 4, width: 12, height: 12 });
        if (os.paragrafo_substituicao) checkbox2.check();
        page.drawText('Declaro que recebi equipamento novo com patrimônio nº', {
            x: 70, y: currentY, font: fontNormal, size: 11, color: rgb(0,0,0)
        });
        const campoPat = form.createTextField('patrimonio_novo');
        campoPat.setText(os.patrimonio_novo || '');
        campoPat.addToPage(page, { x: 70, y: currentY - 20, width: 150, height: 16, borderWidth: 0.5 });
        page.drawText('em substituição ao equipamento acima identificado.', {
            x: 70, y: currentY - 38, font: fontNormal, size: 11, color: rgb(0,0,0)
        });
        currentY -= 90;

        // DATA
        page.drawText('Caraguatatuba,', { x: 280, y: currentY - 20, font: fontOblique, size: 10, color: rgb(0,0,0) });
        const campoDia = form.createTextField('dia');
        campoDia.addToPage(page, { x: 358, y: currentY - 24, width: 25, height: 14, borderWidth: 0.5 });
        page.drawText('de', { x: 392, y: currentY - 20, font: fontOblique, size: 10, color: rgb(0,0,0) });
        const campoMes = form.createTextField('mes');
        campoMes.addToPage(page, { x: 420, y: currentY - 24, width: 60, height: 14, borderWidth: 0.5 });
        page.drawText('de 2026.', { x: 490, y: currentY - 20, font: fontOblique, size: 10, color: rgb(0,0,0) });

        // ASSINATURA COORDENADOR
        page.drawLine({ start: { x: 50, y: currentY - 70 }, end: { x: 250, y: currentY - 70 }, thickness: 0.5, color: rgb(0,0,0) });
        page.drawText(os.nome.toUpperCase(), { x: 50, y: currentY - 83, font: fontTimesBold, size: 9, color: rgb(0,0,0) });
        page.drawText('Assinatura do Coordenador do Cartório', { x: 50, y: currentY - 95, font: fontTimes, size: 8, color: rgb(0,0,0) });

        // RODAPÉ
        const rodapePath = path.join(__dirname, 'public', 'it2b rodapé img.jpg');
        if (fs.existsSync(rodapePath)) {
            const rodapeBytes = fs.readFileSync(rodapePath);
            const rodapeImage = await pdfDoc.embedJpg(rodapeBytes);
            page.drawImage(rodapeImage, { x: 0, y: 0, width: 595, height: 80 });
        }

        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="os-${os.id}.pdf"`);
        res.end(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('[ERRO] Gerar PDF:', err);
        res.status(500).send('Erro interno ao gerar PDF.');
    }
});

// =====================================================
// ROTAS — INVENTÁRIO
// =====================================================
app.get('/inventario', (req, res) => {
    try {
        const itens = db.prepare('SELECT * FROM inventario ORDER BY id DESC').all();
        const usuario = req.session.usuario || null;
        const isLoggedIn = !!usuario;
        const rows = itens.map(item => `
            <tr>
                <td>${escapeHtml(String(item.id))}</td>
                <td>${escapeHtml(item.equipamento)}</td>
                <td>${escapeHtml(item.patrimonio)}</td>
                <td>${escapeHtml(item.cartorio)}</td>
                <td>${badgeInventario(item.status)}</td>
                <td>${escapeHtml(item.numero_chamado) || '—'}</td>
                <td>${escapeHtml(item.data_atualizacao)}</td>
                <td>${escapeHtml(item.modificado_por)}</td>
                <td>${isLoggedIn ? `<a href="/inventario/editar/${item.id}" class="btn-action btn-editar">✏</a>` : '—'}</td>
            </tr>
        `).join('');
        const tableContent = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Lista de Inventário</h1>
                    <p class="page-subtitle">Consulte e gerencie os equipamentos e patrimônios cadastrados.</p>
                </div>
                ${isLoggedIn
                    ? `<a href="/inventario/novo" class="btn-primary">+ Novo Equipamento</a>`
                    : `<a href="/login" class="btn-secondary">Login para editar</a>`}
            </div>
            <div class="table-wrapper">
                <div class="table-filters">
                    <input type="text" id="busca-inv" placeholder="🔍 Buscar por patrimônio, equipamento..." class="search-input" oninput="filtrarInv()">
                </div>
                <div class="table-scroll">
                    <table class="inv-table">
                        <thead>
                            <tr>
                                <th>ID</th><th>Equipamento</th><th>Patrimônio</th><th>Cartório</th>
                                <th>Status</th><th>Nº Chamado</th><th>Última Atualização</th>
                                <th>Modificado por</th><th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-inv">
                            ${rows || '<tr><td colspan="9" class="empty-row">Nenhum equipamento cadastrado.</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <div class="table-footer">Mostrando ${itens.length} registro${itens.length !== 1 ? 's' : ''}</div>
            </div>
            ${isLoggedIn ? '' : `<div style="margin-top:1rem"><a href="/" class="btn-secondary">← Voltar</a></div>`}
            <script>
                function filtrarInv() {
                    const b = document.getElementById('busca-inv').value.toLowerCase();
                    document.querySelectorAll('#tbody-inv tr').forEach(tr => {
                        tr.style.display = tr.textContent.toLowerCase().includes(b) ? '' : 'none';
                    });
                }
            </script>
        `;
        if (isLoggedIn) {
            res.send(layout({ titulo: 'Inventário', conteudo: tableContent, usuario, paginaAtiva: 'inventario' }));
        } else {
            res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inventário de Equipamentos — IT2B</title>
    <link rel="stylesheet" href="/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
    <header class="inv-public-header">
        <div class="inv-public-header-logo">
            <img src="/IT2B IMG.png" alt="IT2B" onerror="this.style.display='none'">
            <span class="inv-public-header-title">Inventário de Equipamentos</span>
        </div>
        <a href="/" class="btn-logout" style="border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.8)">← Início</a>
    </header>
    <div class="inventario-public">${tableContent}</div>
</body>
</html>`);
        }
    } catch (err) {
        console.error('[ERRO] Inventário:', err);
        res.status(500).send('Erro ao carregar inventário.');
    }
});

app.get('/inventario/novo', verificarLogin, verificarTrocaSenha, (req, res) => {
    const usuario = req.session.usuario;
    const conteudo = `
        <div class="page-header">
            <div>
                <h1 class="page-title">Novo Equipamento</h1>
                <p class="page-subtitle">Cadastre um novo equipamento no inventário.</p>
            </div>
            <a href="/inventario" class="btn-secondary">← Voltar</a>
        </div>
        <div class="card">
            <form action="/inventario/novo" method="POST" class="form-grid">
                <div class="form-group">
                    <label>Equipamento <span class="required">*</span></label>
                    <input type="text" name="equipamento" required>
                </div>
                <div class="form-group">
                    <label>Patrimônio <span class="required">*</span></label>
                    <input type="text" name="patrimonio" required>
                </div>
                <div class="form-group">
                    <label>Cartório <span class="required">*</span></label>
                    <input type="text" name="cartorio" required>
                </div>
                <div class="form-group">
                    <label>Nº Chamado</label>
                    <input type="text" name="numero_chamado">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-select">
                        <option value="funcionando">🟢 Funcionando</option>
                        <option value="aguardando_chamado">🟡 Aguardando Chamado</option>
                        <option value="em_manutencao">🔴 Em Manutenção</option>
                        <option value="emprestado">🔵 Emprestado</option>
                        <option value="enviado_conserto">🟠 Enviado p/ Conserto</option>
                        <option value="descartado">⚫ Descartado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Modificado por <span class="required">*</span></label>
                    <select name="modificado_por" class="form-select">
                        <option value="Saulo Levy Lima Martins">Saulo Levy Lima Martins</option>
                        <option value="Anderson Marques Farias">Anderson Marques Farias</option>
                    </select>
                </div>
                <div class="form-group full-width form-actions">
                    <button type="submit" class="btn-primary">Salvar Equipamento</button>
                    <a href="/inventario" class="btn-secondary">Cancelar</a>
                </div>
            </form>
        </div>
    `;
    res.send(layout({ titulo: 'Novo Equipamento', conteudo, usuario, paginaAtiva: 'inventario' }));
});

app.post('/inventario/novo', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const { equipamento, patrimonio, cartorio, numero_chamado, status, modificado_por } = req.body;
        const data = new Date().toLocaleDateString('pt-BR');
        db.prepare(`
            INSERT INTO inventario (equipamento, patrimonio, cartorio, numero_chamado, status, data_atualizacao, modificado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(equipamento, patrimonio, cartorio, numero_chamado || null, status, data, modificado_por);
        res.redirect('/inventario');
    } catch (err) {
        console.error('[ERRO] Novo equipamento:', err);
        res.status(500).send('Erro ao cadastrar equipamento.');
    }
});

app.get('/inventario/editar/:id', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const usuario = req.session.usuario;
        const item = db.prepare('SELECT * FROM inventario WHERE id = ?').get(req.params.id);
        if (!item) return res.status(404).send('Equipamento não encontrado.');
        const statusOpts = [
            { v: 'funcionando',        l: '🟢 Funcionando' },
            { v: 'aguardando_chamado', l: '🟡 Aguardando Chamado' },
            { v: 'em_manutencao',      l: '🔴 Em Manutenção' },
            { v: 'emprestado',         l: '🔵 Emprestado' },
            { v: 'enviado_conserto',   l: '🟠 Enviado p/ Conserto' },
            { v: 'descartado',         l: '⚫ Descartado' }
        ].map(o => `<option value="${o.v}" ${o.v === item.status ? 'selected' : ''}>${o.l}</option>`).join('');
        const tecnicoOpts = ['Saulo Levy Lima Martins', 'Anderson Marques Farias']
            .map(t => `<option value="${t}" ${t === item.modificado_por ? 'selected' : ''}>${t}</option>`).join('');
        const conteudo = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Editar Equipamento</h1>
                    <p class="page-subtitle">${escapeHtml(item.equipamento)} — Patrimônio: ${escapeHtml(item.patrimonio)}</p>
                </div>
                <a href="/inventario" class="btn-secondary">← Voltar</a>
            </div>
            <div class="card">
                <form action="/inventario/editar/${item.id}" method="POST" class="form-grid">
                    <div class="form-group">
                        <label>Equipamento <span class="required">*</span></label>
                        <input type="text" name="equipamento" value="${escapeHtml(item.equipamento)}" required>
                    </div>
                    <div class="form-group">
                        <label>Patrimônio <span class="required">*</span></label>
                        <input type="text" name="patrimonio" value="${escapeHtml(item.patrimonio)}" required>
                    </div>
                    <div class="form-group">
                        <label>Cartório <span class="required">*</span></label>
                        <input type="text" name="cartorio" value="${escapeHtml(item.cartorio)}" required>
                    </div>
                    <div class="form-group">
                        <label>Nº Chamado</label>
                        <input type="text" name="numero_chamado" value="${escapeHtml(item.numero_chamado) || ''}">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select name="status" class="form-select">${statusOpts}</select>
                    </div>
                    <div class="form-group">
                        <label>Modificado por</label>
                        <select name="modificado_por" class="form-select">${tecnicoOpts}</select>
                    </div>
                    <div class="form-group full-width form-actions">
                        <button type="submit" class="btn-primary">Atualizar Equipamento</button>
                        <a href="/inventario" class="btn-secondary">Cancelar</a>
                    </div>
                </form>
            </div>
        `;
        res.send(layout({ titulo: 'Editar Equipamento', conteudo, usuario, paginaAtiva: 'inventario' }));
    } catch (err) {
        console.error('[ERRO] Form editar inventário:', err);
        res.status(500).send('Erro ao carregar equipamento.');
    }
});

app.post('/inventario/editar/:id', verificarLogin, verificarTrocaSenha, (req, res) => {
    try {
        const { equipamento, patrimonio, cartorio, numero_chamado, status, modificado_por } = req.body;
        const data = new Date().toLocaleDateString('pt-BR');
        db.prepare(`
            UPDATE inventario SET
                equipamento = ?, patrimonio = ?, cartorio = ?,
                numero_chamado = ?, status = ?, data_atualizacao = ?, modificado_por = ?
            WHERE id = ?
        `).run(equipamento, patrimonio, cartorio, numero_chamado || null, status, data, modificado_por, req.params.id);
        res.redirect('/inventario');
    } catch (err) {
        console.error('[ERRO] Salvar inventário:', err);
        res.status(500).send('Erro ao atualizar equipamento.');
    }
});

// =====================================================
// SERVIDOR
// =====================================================
// Coloca isso:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 IT2B rodando na porta ${PORT}`);
});
