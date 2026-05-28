const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
const db = new Database('./database/os.db');

// =========================
// BANCO DE DADOS
// =========================

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

// =========================
// CONFIGURAÇÃO UPLOAD PDF
// =========================

const upload = multer({ dest: 'uploads/' });

// =========================
// MIDDLEWARES
// =========================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));

// =========================
// ROTA INICIAL
// =========================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =========================
// CRIAR OS
// =========================

app.post('/os', (req, res) => {
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
        numero_chamado, nome, cartorio, equipamento,
        patrimonio, descricao, data_retirada, tecnico,
        paragrafo_reparo ? 1 : 0,
        paragrafo_substituicao ? 1 : 0,
        patrimonio_novo || null
    );

    res.redirect(`/os/${result.lastInsertRowid}`);
});

// =========================
// ATUALIZAR STATUS
// =========================

app.post('/status/:id', (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE ordens SET status = ? WHERE id = ?')
      .run(status, req.params.id);
    res.redirect(`/os/${req.params.id}`);
});

// =========================
// BADGE DE STATUS
// =========================

function badgeStatus(status) {
    const badges = {
        'aberta':           { cor: '#fff3cd', texto: '#856404', label: '🟡 Aberta' },
        'assinada':         { cor: '#cfe2ff', texto: '#084298', label: '🔵 Assinada por você' },
        'aguardando_chefe': { cor: '#ffe5d0', texto: '#7c3c00', label: '🟠 Aguardando chefe' },
        'concluida':        { cor: '#d1e7dd', texto: '#0f5132', label: '✅ Concluída' }
    };
    const b = badges[status] || badges['aberta'];
    return `<span class="badge" style="background:${b.cor};color:${b.texto}">${b.label}</span>`;
}

// =========================
// VISUALIZAR OS
// =========================

app.get('/os/:id', (req, res) => {
    const os = db.prepare('SELECT * FROM ordens WHERE id = ?').get(req.params.id);
    if (!os) return res.send('OS não encontrada');

    const formatarData = (d) => d ? d.split('-').reverse().join('/') : '—';

    const proximoStatus = {
        'aberta':           { valor: 'assinada',         label: '🔵 Marcar como Assinada por mim' },
        'assinada':         { valor: 'aguardando_chefe', label: '🟠 Marcar como Enviada ao Chefe' },
        'aguardando_chefe': { valor: 'concluida',        label: '✅ Marcar como Concluída' },
        'concluida':        null
    };
    const prox = proximoStatus[os.status];

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <title>OS #${os.id} - IT2B</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <header>
                <h1>Ordem de Serviço #${os.id}</h1>
                <img src="/IT2B IMG.png" alt="IT2B">
            </header>
            <div class="container">
                <div class="card">
                    <h2>Dados da OS</h2>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>OS Nº</label>
                            <p>#${os.id}</p>
                        </div>
                        <div class="info-item">
                            <label>Chamado</label>
                            <p>${os.numero_chamado || '—'}</p>
                        </div>
                        <div class="info-item">
                            <label>Nome do Responsável</label>
                            <p>${os.nome}</p>
                        </div>
                        <div class="info-item">
                            <label>Cartório</label>
                            <p>${os.cartorio}</p>
                        </div>
                        <div class="info-item">
                            <label>Equipamento</label>
                            <p>${os.equipamento}</p>
                        </div>
                        <div class="info-item">
                            <label>Patrimônio</label>
                            <p>${os.patrimonio}</p>
                        </div>
                        <div class="info-item">
                            <label>Data da Retirada</label>
                            <p>${formatarData(os.data_retirada)}</p>
                        </div>
                        <div class="info-item">
                            <label>Técnico Responsável</label>
                            <p>${os.tecnico}</p>
                        </div>
                    </div>
                    <div class="info-item">
                        <label>Descrição</label>
                        <p>${os.descricao}</p>
                    </div>
                    <br>
                    ${os.paragrafo_reparo ? `
                    <div class="info-item">
                        <label>✅ Inclui devolução por reparo</label>
                    </div>` : ''}
                    ${os.paragrafo_substituicao ? `
                    <div class="info-item">
                        <label>✅ Inclui substituição de equipamento</label>
                        <p>Patrimônio novo: ${os.patrimonio_novo || '—'}</p>
                    </div>` : ''}
                    <br>
                    <div class="info-item">
                        <label>Status</label>
                        <p>${badgeStatus(os.status)}</p>
                    </div>
                    <br>
                    <div class="info-item">
                        <label>PDF Assinado</label>
                        <p>
                            <span class="badge ${os.pdf_assinado ? 'badge-assinado' : 'badge-pendente'}">
                                ${os.pdf_assinado ? '✅ Assinado' : '⏳ Pendente'}
                            </span>
                            ${os.pdf_assinado
                                ? `&nbsp;<a href="/uploads/${os.pdf_assinado}" target="_blank" class="btn-link">Baixar PDF</a>`
                                : ''
                            }
                        </p>
                    </div>
                </div>

                ${prox ? `
                <div class="card">
                    <h2>Avançar Status</h2>
                    <form action="/status/${os.id}" method="POST">
                        <input type="hidden" name="status" value="${prox.valor}">
                        <button type="submit">${prox.label}</button>
                    </form>
                </div>` : ''}

                <div class="card">
                    <h2>Upload do PDF Assinado</h2>
                    <form action="/upload/${os.id}" method="POST" enctype="multipart/form-data">
                        <label>Data da Devolução</label>
                        <input type="date" name="data_devolucao">
                        <label>PDF Assinado</label>
                        <input type="file" name="pdf" accept=".pdf" required>
                        <button type="submit">Salvar PDF Assinado</button>
                    </form>
                </div>

                <a href="/gerar-pdf/${os.id}" class="btn-pdf">📄 Gerar PDF</a>
                &nbsp;
                <a href="/lista" class="btn-link">Ver todas as OS</a>
            </div>
        </body>
        </html>
    `);
});

// =========================
// GERAR PDF DA OS
// =========================

app.get('/gerar-pdf/:id', async (req, res) => {
    const os = db.prepare('SELECT * FROM ordens WHERE id = ?').get(req.params.id);
    if (!os) return res.send('OS não encontrada');

    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

    const formatarData = (data) => {
        if (!data) return '';
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { height } = page.getSize();
    const form = pdfDoc.getForm();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);

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

    // 2º PARÁGRAFO — Reparo
    if (os.paragrafo_reparo) {
        const checkbox1 = form.createCheckBox('reparo');
        checkbox1.addToPage(page, { x: 50, y: currentY - 4, width: 12, height: 12 });
        page.drawText('Declaro que recebi o equipamento acima identificado devidamente funcionando.', {
            x: 70, y: currentY, font: fontNormal, size: 11, color: rgb(0,0,0)
        });
        currentY -= 35;
    }

    // 3º PARÁGRAFO — Substituição
    if (os.paragrafo_substituicao) {
        const checkbox2 = form.createCheckBox('substituicao');
        checkbox2.addToPage(page, { x: 50, y: currentY - 4, width: 12, height: 12 });
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
    }

    // DATA
    page.drawText('Caraguatatuba,', { x: 280, y: currentY - 20, font: fontOblique, size: 10, color: rgb(0,0,0) });
    const campoDia = form.createTextField('dia');
    campoDia.addToPage(page, { x: 358, y: currentY - 24, width: 25, height: 14, borderWidth: 0.5 });
    page.drawText('de', { x: 392, y: currentY - 20, font: fontOblique, size: 10, color: rgb(0,0,0) });
    const campoMes = form.createTextField('mes');
    campoMes.addToPage(page, { x: 420, y: currentY - 24, width: 25, height: 14, borderWidth: 0.5 });
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
});

// =========================
// UPLOAD PDF ASSINADO
// =========================

app.post('/upload/:id', upload.single('pdf'), (req, res) => {
    const tempPath = req.file.path;
    const filename = `os-${req.params.id}-assinada.pdf`;
    const finalPath = path.join(__dirname, 'uploads', filename);

    fs.renameSync(tempPath, finalPath);

    const data_devolucao = req.body.data_devolucao;

    db.prepare(`
        UPDATE ordens SET pdf_assinado = ?, data_devolucao = ?, status = 'concluida'
        WHERE id = ?
    `).run(filename, data_devolucao || null, req.params.id);

    res.redirect(`/os/${req.params.id}`);
});

// =========================
// LISTAGEM DE OS
// =========================

app.get('/lista', (req, res) => {
    const ordens = db.prepare('SELECT * FROM ordens').all();
    const formatarData = (d) => d ? d.split('-').reverse().join('/') : '—';

    let cards = '';

    ordens.forEach(os => {
        cards += `
            <div class="card">
                <div class="info-grid">
                    <div class="info-item">
                        <label>OS Nº</label>
                        <p>#${os.id}</p>
                    </div>
                    <div class="info-item">
                        <label>Chamado</label>
                        <p>${os.numero_chamado || '—'}</p>
                    </div>
                    <div class="info-item">
                        <label>Nome do Responsável</label>
                        <p>${os.nome}</p>
                    </div>
                    <div class="info-item">
                        <label>Cartório</label>
                        <p>${os.cartorio}</p>
                    </div>
                    <div class="info-item">
                        <label>Equipamento</label>
                        <p>${os.equipamento}</p>
                    </div>
                    <div class="info-item">
                        <label>Patrimônio</label>
                        <p>${os.patrimonio}</p>
                    </div>
                    <div class="info-item">
                        <label>Data da Retirada</label>
                        <p>${formatarData(os.data_retirada)}</p>
                    </div>
                    <div class="info-item">
                        <label>Técnico</label>
                        <p>${os.tecnico}</p>
                    </div>
                </div>
                <div class="info-item">
                    <label>Status</label>
                    <p>${badgeStatus(os.status)}</p>
                </div>
                <br>
                <a href="/os/${os.id}" class="btn-link">Abrir OS</a>
            </div>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <title>Lista de OS - IT2B</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <header>
                <h1>Ordens de Serviço</h1>
                <img src="/IT2B IMG.png" alt="IT2B">
            </header>
            <div class="container">
                ${cards.length ? cards : '<div class="card"><p>Nenhuma OS cadastrada.</p></div>'}
                <a href="/" class="btn-link">Nova OS</a>
            </div>
        </body>
        </html>
    `);
});

// =========================
// INVENTÁRIO — LISTAR
// =========================

app.get('/inventario', (req, res) => {
    const itens = db.prepare('SELECT * FROM inventario ORDER BY id DESC').all();

    const statusBadge = (status) => {
        const map = {
            'funcionando':        { cor: '#d1e7dd', texto: '#0f5132', label: '🟢 Funcionando' },
            'aguardando_chamado': { cor: '#fff3cd', texto: '#856404', label: '🟡 Aguardando Chamado' },
            'em_manutencao':      { cor: '#f8d7da', texto: '#842029', label: '🔴 Em Manutenção' },
            'emprestado':         { cor: '#cfe2ff', texto: '#084298', label: '🔵 Emprestado' },
            'enviado_conserto':   { cor: '#ffe5d0', texto: '#7c3c00', label: '🟠 Enviado p/ Conserto' },
            'descartado':         { cor: '#e2e3e5', texto: '#41464b', label: '⚫ Descartado' }
        };
        const b = map[status] || map['funcionando'];
        return `<span class="badge" style="background:${b.cor};color:${b.texto}">${b.label}</span>`;
    };

    let cards = '';
    itens.forEach(item => {
        cards += `
            <div class="card">
                <div class="info-grid">
                    <div class="info-item">
                        <label>Equipamento</label>
                        <p>${item.equipamento}</p>
                    </div>
                    <div class="info-item">
                        <label>Patrimônio</label>
                        <p>${item.patrimonio}</p>
                    </div>
                    <div class="info-item">
                        <label>Cartório de Origem</label>
                        <p>${item.cartorio}</p>
                    </div>
                    <div class="info-item">
                        <label>N° Chamado</label>
                        <p>${item.numero_chamado || '—'}</p>
                    </div>
                    <div class="info-item">
                        <label>Última Atualização</label>
                        <p>${item.data_atualizacao}</p>
                    </div>
                    <div class="info-item">
                        <label>Modificado por</label>
                        <p>${item.modificado_por}</p>
                    </div>
                </div>
                <div class="info-item">
                    <label>Status</label>
                    <p>${statusBadge(item.status)}</p>
                </div>
                <br>
                <a href="/inventario/editar/${item.id}" class="btn-link">Editar</a>
            </div>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <title>Inventário - IT2B</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <header>
                <h1>Inventário de Equipamentos</h1>
                <img src="/IT2B IMG.png" alt="IT2B">
            </header>
            <div class="container">
                <a href="/inventario/novo" class="btn-pdf">+ Novo Equipamento</a>
                &nbsp;
                <a href="/" class="btn-link">Ordens de Serviço</a>
                <br><br>
                ${itens.length ? cards : '<div class="card"><p>Nenhum equipamento cadastrado.</p></div>'}
            </div>
        </body>
        </html>
    `);
});

// =========================
// INVENTÁRIO — NOVO
// =========================

app.get('/inventario/novo', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <title>Novo Equipamento - IT2B</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <header>
                <h1>Novo Equipamento</h1>
                <img src="/IT2B IMG.png" alt="IT2B">
            </header>
            <div class="container">
                <div class="card">
                    <h2>Cadastrar Equipamento</h2>
                    <form action="/inventario/novo" method="POST">

                        <label>Equipamento</label>
                        <input type="text" name="equipamento" required>

                        <label>Patrimônio</label>
                        <input type="text" name="patrimonio" required>

                        <label>Cartório de Origem</label>
                        <input type="text" name="cartorio" required>

                        <label>N° Chamado (opcional)</label>
                        <input type="text" name="numero_chamado">

                        <label>Status</label>
                        <select name="status" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            <option value="funcionando">🟢 Funcionando</option>
                            <option value="aguardando_chamado">🟡 Aguardando Chamado</option>
                            <option value="em_manutencao">🔴 Em Manutenção</option>
                            <option value="emprestado">🔵 Emprestado</option>
                            <option value="enviado_conserto">🟠 Enviado p/ Conserto</option>
                            <option value="descartado">⚫ Descartado</option>
                        </select>

                        <label>Modificado por</label>
                        <select name="modificado_por" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            <option value="Saulo Levy">Saulo Levy</option>
                            <option value="Anderson Marques">Anderson Marques</option>
                            <option value="Emerson Kocis">Emerson Kocis</option>
                        </select>

                        <button type="submit">Salvar Equipamento</button>
                    </form>
                </div>
                <a href="/inventario" class="btn-link">Voltar</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/inventario/novo', (req, res) => {
    const { equipamento, patrimonio, cartorio, numero_chamado, status, modificado_por } = req.body;
    const data = new Date().toLocaleDateString('pt-BR');

    db.prepare(`
        INSERT INTO inventario (equipamento, patrimonio, cartorio, numero_chamado, status, data_atualizacao, modificado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(equipamento, patrimonio, cartorio, numero_chamado || null, status, data, modificado_por);

    res.redirect('/inventario');
});

// =========================
// INVENTÁRIO — EDITAR
// =========================

app.get('/inventario/editar/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM inventario WHERE id = ?').get(req.params.id);
    if (!item) return res.send('Equipamento não encontrado');

    const options = (val) => [
        { value: 'funcionando', label: '🟢 Funcionando' },
        { value: 'aguardando_chamado', label: '🟡 Aguardando Chamado' },
        { value: 'em_manutencao', label: '🔴 Em Manutenção' },
        { value: 'emprestado', label: '🔵 Emprestado' },
        { value: 'enviado_conserto', label: '🟠 Enviado p/ Conserto' },
        { value: 'descartado', label: '⚫ Descartado' }
    ].map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`).join('');

    const tecnicos = (val) => ['Saulo Levy', 'Anderson Marques', 'Emerson Kocis']
        .map(t => `<option value="${t}" ${t === val ? 'selected' : ''}>${t}</option>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <title>Editar Equipamento - IT2B</title>
            <link rel="stylesheet" href="/style.css">
        </head>
        <body>
            <header>
                <h1>Editar Equipamento</h1>
                <img src="/IT2B IMG.png" alt="IT2B">
            </header>
            <div class="container">
                <div class="card">
                    <h2>Atualizar Equipamento</h2>
                    <form action="/inventario/editar/${item.id}" method="POST">

                        <label>Equipamento</label>
                        <input type="text" name="equipamento" value="${item.equipamento}" required>

                        <label>Patrimônio</label>
                        <input type="text" name="patrimonio" value="${item.patrimonio}" required>

                        <label>Cartório de Origem</label>
                        <input type="text" name="cartorio" value="${item.cartorio}" required>

                        <label>N° Chamado (opcional)</label>
                        <input type="text" name="numero_chamado" value="${item.numero_chamado || ''}">

                        <label>Status</label>
                        <select name="status" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            ${options(item.status)}
                        </select>

                        <label>Modificado por</label>
                        <select name="modificado_por" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
                            ${tecnicos(item.modificado_por)}
                        </select>

                        <button type="submit">Atualizar</button>
                    </form>
                </div>
                <a href="/inventario" class="btn-link">Voltar</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/inventario/editar/:id', (req, res) => {
    const { equipamento, patrimonio, cartorio, numero_chamado, status, modificado_por } = req.body;
    const data = new Date().toLocaleDateString('pt-BR');

    db.prepare(`
        UPDATE inventario SET
            equipamento = ?, patrimonio = ?, cartorio = ?,
            numero_chamado = ?, status = ?, data_atualizacao = ?, modificado_por = ?
        WHERE id = ?
    `).run(equipamento, patrimonio, cartorio, numero_chamado || null, status, data, modificado_por, req.params.id);

    res.redirect('/inventario');
});

app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});