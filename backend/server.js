const express = require('express');
const app = express();
const port = 3000;
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const fs2 = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const mintToken = require('./mintToken');
const moment = require('moment');
const archiver = require('archiver'); // to zip pdf

// Express server
app.use(express.json());

async function createPdfFromContent(payload) {
    const pdfDoc = await PDFDocument.create();

    for (const item of payload) {
        if (item.type === 'text') {
            // console.log(`Adding text: ${item.text}`);

            // Add text to PDF
            const page = pdfDoc.addPage();
            page.drawText(item.text);
        } else if (item.type === 'image') {
            console.log(`Adding image from URL: ${item.url}`);

            // Fetch the image from the URL
            const response = await fetch(item.url);
            if (response.ok) {
                console.log(`Fetched image successfully: ${item.url}`);
            } else {
                console.log(`Failed to fetch image: ${item.url}`);
            }

            console.log(`Fetch response status for ${item.url}: ${response.status}`);

            const imageBytes = await response.arrayBuffer();
            console.log(`Fetched image byte length: ${imageBytes.byteLength}`); //ok so far
            console.log(imageBytes); // ok 

            // Convert WebP to PNG using sharp
            let pngBuffer;
            try {
                pngBuffer = await sharp(Buffer.from(imageBytes)).png().toBuffer();
                console.log(`Image converted to PNG successfully.`);
            } catch (error) {
                console.error(`Failed to convert image: ${error}`);
                continue;
            }

            // Add image to PDF
            const image = await pdfDoc.embedPng(pngBuffer);
            console.log(`Image embedded successfully: ${item.url}`);

            const page = pdfDoc.addPage();
            console.log('added page successfully');

            page.drawImage(image, {
                x: page.getWidth() / 2 - image.width / 2,
                y: page.getHeight() / 2 - image.height / 2,
                width: image.width,
                height: image.height,
            });
            console.log(`Drew image on page: ${item.url}, Dimensions: ${image.width}x${image.height}, Position: center`);
        }
    }

    // Serialize the PDF to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF saved, byte length: ${pdfBytes.byteLength}`); // OK

    // Define a path for the PDF file
    const filePath = './storage/creative-process.pdf';

    // Save the PDF to the server's filesystem
    await fs.writeFile(filePath, pdfBytes);
    console.log(`Creative process saved to server: ${filePath}`);

    return filePath;
}

async function createCertificate(txD, txH, uri) {
    const pdfDoc = await PDFDocument.create();
    let date = moment(txD).format('llll');
    const page = pdfDoc.addPage();
    page.drawText(`Certificate of timestamp \n` +
        `Your artwork and your creative process have been recorded; \n` +
        `Date and time: ${date} \n` +
        `Find your timestamp on XRPL using the hash: ${txH} \n` +
        `The hash of your creative process: ${uri}`,
        {
            x: 100, //shorter side
            y: 100, //longer side
            size: 12,
            rotate: degrees(+90)
        }
    );
    const pdfBytes = await pdfDoc.save();
    const filePath = './storage/certificate-of-timestamp.pdf';
    await fs.writeFile(filePath, pdfBytes);
    console.log(`Certificate saved to server: ${filePath}`);

    return filePath;
}

// hash PDF 
async function hashPdf(file) {
    try {
        // Read the PDF file
        const pdfBuffer = await fs.readFile(file);
        const hash = crypto.createHash('sha256');
        const pdfHash = hash.update(pdfBuffer).digest('hex');

        return pdfHash;
    } catch (error) {
        console.error('Error hashing the PDF:', error);
        throw error;
    }
}

// Zip files
async function zipFiles(files, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs2.createWriteStream(outputPath);
        console.log('zip saved at: ' + outputPath);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', function () {
            resolve(outputPath);
            console.log(`Zip file has been written to ${outputPath}.`);
        });

        output.on('finish', function () {
            console.log('Output stream finished writing.');
        });

        output.on('error', function (err) {
            console.error('Stream error:', err);
            reject(err);
        });

        archive.on('end', function () {
            console.log('Archive stream ended.');
        });

        archive.on('error', function (err) {
            console.error('Archiver error:', err);
            reject(err);
        });

        archive.pipe(output);

        for (const file of files) {
            archive.append(fs2.createReadStream(file.path), { name: file.name });
        }

        archive.finalize();
    });
}

app.post('/create-pdf', async (req, res) => {
    const { conversationContent: payload } = req.body;
    console.log('Starting PDF creation...');

    try {
        //create the creative process PDF
        const pdfPath = await createPdfFromContent(payload);
        console.log('Creative process created, pdf path:' + pdfPath);

        const hash = await hashPdf(pdfPath);
        console.log('PDF hashed');

        //mint the NFT 
        const { txDate, txHash, txURI } = await mintToken(hash);
        console.log('NFT minted successfully.');

        // create the certificate of timestamp:
        const certPath = await createCertificate(txDate, txHash, txURI);
        console.log('certificate created, certPath:' + certPath);

        // create the zip 
        const filesToZip = [
            { path: pdfPath, name: 'creative-process.pdf' },
            { path: certPath, name: 'certificate-of-timestamp.pdf' }
        ];
        console.log('filesToZip function: ' + filesToZip[0].path);
        console.log('filesToZip function: ' + filesToZip[1].name);

        const zipPath = './storage/combined-pdfs.zip';
        await zipFiles(filesToZip, zipPath);
        console.log('Zip file created');

        res.setHeader('Content-Disposition', 'attachment; filename=combined-pdfs.zip');

        // Send the PDF file back in the response
        res.sendFile(zipPath, {
            root: __dirname
        }, function (err) {
            if (err) {
                console.log(err);
                res.status(500).send('An error occurred');
            } else {
                console.log('Zip file sent to the user.');
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error processing your request', error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

