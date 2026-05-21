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
        data_devolucao TEXT,
        pdf_assinado TEXT
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
        numero_chamado,
        nome,
        cartorio,
        equipamento,
        patrimonio,
        descricao,
        data_retirada,
        tecnico
    } = req.body;

    const result = db.prepare(`
        INSERT INTO ordens (
            numero_chamado,
            nome,
            cartorio,
            equipamento,
            patrimonio,
            descricao,
            data_retirada,
            tecnico
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        numero_chamado,
        nome,
        cartorio,
        equipamento,
        patrimonio,
        descricao,
        data_retirada,
        tecnico
    );

    res.redirect(`/os/${result.lastInsertRowid}`);
});

// =========================
// VISUALIZAR OS
// =========================

app.get('/os/:id', (req, res) => {
    const os = db
        .prepare('SELECT * FROM ordens WHERE id = ?')
        .get(req.params.id);

    if (!os) return res.send('OS não encontrada');

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
                            <p>${os.data_retirada ? os.data_retirada.split('-').reverse().join('/') : '—'}</p>
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

                <div class="card">
                    <h2>Upload do PDF Assinado</h2>
                    <form action="/upload/${os.id}" method="POST" enctype="multipart/form-data">
                        <label>Data da Devolução</label>
                        <input type="date" name="data_devolucao" required>
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

app.get('/gerar-pdf/:id', (req, res) => {
    const os = db
        .prepare('SELECT * FROM ordens WHERE id = ?')
        .get(req.params.id);

    if (!os) return res.send('OS não encontrada');

    const formatarData = (data) => {
        if (!data) return '';
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="os-${os.id}.pdf"`);

    doc.pipe(res);

    // LOGO
    const logoPath = path.join(__dirname, 'public', 'IT2B IMG.png');
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 430, 30, { width: 110 });
    }

    // TÍTULO
    doc.fontSize(20).fillColor('#000000').font('Helvetica-Bold')
       .text('ORDEM DE SERVIÇO', 50, 40);

    // SUBTÍTULO
    doc.fontSize(14).font('Helvetica-BoldOblique')
       .text('Tribunal de Justiça do Estado de São Paulo', 50);

    // COMARCA
    doc.fontSize(16).font('Helvetica-Oblique')
       .text('Comarca de Caraguatatuba', 50);

    doc.moveDown(1);

    // NÚMERO DA OS E CHAMADO
    doc.fontSize(11).font('Helvetica')
       .text(
            `OS Nº: ${os.id}${os.numero_chamado ? `          Chamado: ${os.numero_chamado}` : ''}`,
            50
        );

    doc.moveDown(1.5);

    // 1º PARÁGRAFO
    doc.fontSize(12).font('Times-Roman')
       .text('Declaro estar ciente de que o equipamento ', { continued: true, align: 'justify' })
       .font('Times-Bold').text(`${os.equipamento.toUpperCase()}`, { continued: true })
       .font('Times-Roman').text(', de patrimônio nº ', { continued: true })
       .font('Times-Bold').text(`${os.patrimonio.toUpperCase()}`, { continued: true })
       .font('Times-Roman').text(', pertence a ', { continued: true })
       .font('Times-Bold').text(`${os.cartorio.toUpperCase()}`, { continued: true })
       .font('Times-Roman').text(', será encaminhado para a sala de informática na data ', { continued: true })
       .font('Times-Bold').text(`${formatarData(os.data_retirada)} `, { continued: true })
       .font('Times-Roman').text('para fins de manutenção.', { align: 'justify' });

    doc.moveDown(2);

    // 2º PARÁGRAFO
    doc.fontSize(12).font('Helvetica')
       .text(
        'Declaro ainda estar ciente de que o referido equipamento ficará sob responsabilidade do setor de informática durante o período necessário para execução dos serviços. Após devolução, será assinado pelo próprio.',
        { align: 'justify' }
    );

    doc.moveDown(3);

    // DEVOLUÇÃO
    doc.fontSize(11).font('Helvetica-Oblique')
       .text('Equipamento devolvido em ____/____/________', { align: 'right' });

    doc.moveDown(5);

    // ASSINATURAS
    const assinaturaY = doc.y;

    // ASSINATURA DO RESPONSÁVEL
    doc.moveTo(50, assinaturaY).lineTo(250, assinaturaY).stroke();
    doc.fontSize(10).font('Times-Bold')
       .text(`${os.nome.toUpperCase()}`, 50, assinaturaY + 5);
    doc.fontSize(9).font('Times-Roman')
       .text('Assinatura do Coordenador do Cartório', 50, assinaturaY + 18);

    // ASSINATURA DO TÉCNICO
    doc.moveTo(310, assinaturaY).lineTo(550, assinaturaY).stroke();
    doc.fontSize(10).font('Times-Bold')
       .text(`Técnico Responsável: ${os.tecnico}`, 310, assinaturaY + 5);
    doc.fontSize(9).font('Times-Roman')
       .text('Assinatura do Técnico Responsável', 310, assinaturaY + 18);

    // RODAPÉ
    const rodapePath = path.join(__dirname, 'public', 'it2b rodapé img.jpg');
    if (fs.existsSync(rodapePath)) {
        doc.image(rodapePath, 0, 750, { width: 595 });
    }

    doc.end();
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
        UPDATE ordens
        SET pdf_assinado = ?, data_devolucao = ?
        WHERE id = ?
    `).run(filename, data_devolucao, req.params.id);

    res.redirect(`/os/${req.params.id}`);
});

// =========================
// LISTAGEM DE OS
// =========================

app.get('/lista', (req, res) => {
    const ordens = db.prepare('SELECT * FROM ordens').all();

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
                        <p>${os.data_retirada}</p>
                    </div>
                    <div class="info-item">
                        <label>Técnico Responsável</label>
                        <p>${os.tecnico}</p>
                    </div>
                </div>
                <div>
                    <label>PDF Assinado</label>
                    <p>
                        <span class="badge ${os.pdf_assinado ? 'badge-assinado' : 'badge-pendente'}">
                            ${os.pdf_assinado ? '✅ Assinado' : '⏳ Pendente'}
                        </span>
                    </p>
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
                ${cards}
                <a href="/" class="btn-link">Nova OS</a>
            </div>
        </body>
        </html>
    `);
});

// =========================
// INICIAR SERVIDOR
// =========================

app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
