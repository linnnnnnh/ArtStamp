// function fetchDocuments(url, pdfName, bodyContent, list) {
//     fetch(url, {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//         },
//         body: bodyContent,
//     })
//         .then(response => {
//             if (!response.ok) {
//                 throw new Error(`HTTP error! status: ${response.status}`);
//             }
//             return response.blob(); 
//         })
//         .then(blob => {
//             const pdfUrl = URL.createObjectURL(blob); 

//             // Create a download link and append it the list
//             const downloadLink = document.createElement('a');
//             downloadLink.href = pdfUrl;
//             downloadLink.download = pdfName;
//             downloadLink.textContent = `Download ${pdfName}`;
//             list.appendChild(downloadLink); 
//         })
//         .catch(error => {
//             console.error('Error fetching and processing the PDF:', error);
//             let li = document.createElement('li');
//             li.innerText = "Error generating PDF";
//             list.appendChild(li);
//         });
// }

// module.exports = fetchDocuments;