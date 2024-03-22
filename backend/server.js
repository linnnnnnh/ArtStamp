const express = require('express');
const app = express();
const port = 3000;
const { PDFDocument, StandardFonts, rgb, degrees, fontkit } = require('pdf-lib');
const fs = require('fs').promises;
const fs2 = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const mintToken = require('./mintToken');
const moment = require('moment');
const archiver = require('archiver');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();



app.use(express.json());
app.use(cors());

async function createPdfFromContent(payload) {
    const pdfDoc = await PDFDocument.create();
    console.log("pdf creating");

    for (const item of payload) {
        if (item.type === 'text') {
            // console.log(`Adding text: ${item.text}`);

            // Add text to PDF
            const page = pdfDoc.addPage();
            console.log("page added for text");

            page.drawText(item.text,
                {
                    x: 50, //shorter side
                    y: 800, //longer side
                    size: 12
                });
        } else if (item.type === 'image') {
            // console.log(`Adding image from URL: ${item.url}`);

            // Fetch the image from the URL
            const response = await fetch(item.url);
            // if (response.ok) {
            //     console.log(`Fetched image successfully: ${item.url}`);
            // } else {
            //     console.log(`Failed to fetch image: ${item.url}`);
            // }

            // console.log(`Fetch response status for ${item.url}: ${response.status}`);

            const imageBytes = await response.arrayBuffer();
            // console.log(`Fetched image byte length: ${imageBytes.byteLength}`); //ok so far
            // console.log(imageBytes); // ok

            // Convert WebP to PNG using sharp
            let pngBuffer;
            try {
                pngBuffer = await sharp(Buffer.from(imageBytes)).png().toBuffer();
                // console.log(`Image converted to PNG successfully.`);
            } catch (error) {
                // console.error(`Failed to convert image: ${error}`);
                continue;
            }

            // Add image to PDF
            const image = await pdfDoc.embedPng(pngBuffer);
            console.log(`Image embedded successfully: ${item.url}`);

            const page = pdfDoc.addPage();
            console.log('added page successfully');

            page.drawImage(image, {
                x: (page.getWidth() - (image.width / 2)) / 2,
                y: (page.getHeight() - (image.height / 2)) / 2,
                width: image.width / 2,
                height: image.height / 2,
            });
            // console.log(`Drew image on page: ${item.url}, Dimensions: ${image.width}x${image.height}, Position: center`);
        }
    }

    // Serialize the PDF to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save();
    // console.log(`PDF saved, byte length: ${pdfBytes.byteLength}`); // OK

    // Define a path for the PDF file
    const filePath = './storage/creative-process.pdf';

    // Save the PDF to the server's filesystem
    await fs.writeFile(filePath, pdfBytes);
    console.log(`Creative process saved to server: ${filePath}`);

    return filePath;
}


async function createCertificate(txD, txH, uri) {
    const pdfDoc = await PDFDocument.create();
    let epoch = txD + 946684800;
    let date = moment(epoch * 1000).format('llll');
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

// wrap text for the pdf
// async function wrapText(font, text, maxWidth, fontSize) {
//     const words = text.split(' ');
//     console.log('words: ' + words);
//     const lines = [];
//     let line = '';

//     words.forEach(word => {
//         console.log('word: ' + word);
//         const testLine = line + word + ' ';
//         console.log('testLine:' + testLine)
//         const testWidth = font.widthOfTextAtSize(text, fontSize);
//         console.log('testWidth: ' + testWidth);

//         if (testWidth > maxWidth && line !== '') {
//             lines.push(line);
//             line = word + ' ';
//         } else {
//             line = testLine;
//         }

//     });

//     lines.push(line.trim()); // Push the last line
//     return lines;
// }


// endpoint to handle the scraped content, create the PDF, mint the NFT and send back the PDFs to the extension

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
        console.log('NFT certificate minted successfully.');

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

// endpoint to receive the selected image and send it to the frontend registry
// let lastUploadedImageUrl = null;
// app.post('/upload-image', async (req, res) => {
//     const { imageUrl } = req.body;

//     try {
//         const response = await fetch(imageUrl);
//         console.log('image: ' + response);
//         if (!response.ok) throw new Error(`Failed to fetch image: ${image.statusText}`);

//         // if image fetched successfully, stream it to Pinata
//         const formData = new FormData();
//         console.log('formdata :' + formData);
//         // Append the image stream directly
//         formData.append('file', response.body);
//         console.log('append: ' + response.body);

//         const pinataMetadata = JSON.stringify({
//             name: "File name",
//         });
//         formData.append("pinataMetadata", pinataMetadata);

//         const pinataOptions = JSON.stringify({
//             cidVersion: 1,
//         });
//         formData.append("pinataOptions", pinataOptions);

//         const res = await axios.post(
//             "https://api.pinata.cloud/pinning/pinFileToIPFS",
//             formData,
//             {
//                 headers: {
//                     Authorization: `Bearer ${process.env.PINATA_JWT}`,
//                 },
//             }
//         );
//         console.log('res.data: ' + res.data);

//         // Assuming Pinata returns the CID in the response
//         const imageCID = res.data.IpfsHash;
//         console.log(imageCID);

//         const pinataUrl = `https://harlequin-cheerful-blackbird-917.mypinata.cloud.mypinata.cloud/ipfs/${imageCID}`;
//         lastUploadedImageUrl = pinataUrl;

//         //mint the NFT 
//         const { txDate, txHash, txURI } = await mintToken(imageCID);
//         console.log('NFT artwork minted successfully.');

//         res.status(200).json({ message: 'Image uploaded and CID obtained successfully', cid: imageCID });

//     } catch (error) {
//         console.log('Error uploading image:', error);
//         res.status(500).json({ message: 'Error uploading image', error: error.toString() });
//     }
// });

// let lastUploadedImagePath = null;
let uploadedImagePaths = [];

app.post('/upload-image', async (req, res) => {
    const { imageUrl } = req.body;

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const imagePath = path.join(__dirname, 'final-artworks', Date.now() + '-' + path.basename(new URL(imageUrl).pathname));
        // lastUploadedImagePath = imagePath;
        uploadedImagePaths.push(imagePath);

        fs2.mkdirSync(path.dirname(imagePath), { recursive: true });

        const dest = fs2.createWriteStream(imagePath);
        response.body.pipe(dest);

        dest.on('finish', () => {
            console.log('Image stored:', imagePath);
            res.status(200).json({ message: 'Image stored successfully', imagePath });
        });

        dest.on('error', (error) => {
            console.log('Error storing image:', error);
            res.status(500).json({ message: 'Error storing image', error: error.toString() });
        });
    } catch (error) {
        console.log('Error fetching image:', error);
        res.status(500).json({ message: 'Error fetching image', error: error.toString() });
    }
});

app.use('/final-artworks', express.static(path.join(__dirname, 'final-artworks')));


app.get('/api/latest-image', (req, res) => {
    if (uploadedImagePaths.length === 0) {
        return res.status(404).json({ error: 'No image has been uploaded yet.' });
    }
    const imageUrls = uploadedImagePaths.map(imagePath =>
        `${req.protocol}://${req.get('host')}/final-artworks/${path.basename(imagePath)}`);
    res.json({ urls: imageUrls });
    // console.log(imageUrl);
});


// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

