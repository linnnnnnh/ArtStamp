let scrapeAndSave = document.getElementById('scrapeAndSave');
let list = document.getElementById('promptConversation');

// 3. handler to receive conversation from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    let conversationContent = request.conversationContent;

    // //Display conversation on pupup
    // if (conversationContent == null || conversationContent.length == 0) {

    //     // no content
    //     let li = document.createElement('li');
    //     li.innerText = "No conversation found";
    //     list.appendChild(li);
    // } else {
    //     // display text content

    //     conversationContent.forEach((content) => {
    //         let li = document.createElement('li');
    //         li.innerText = content;
    //         list.appendChild(li);
    //     });

    //     // display images
    //     conversationContent.forEach((content) => {
    //         let img = document.createElement('img');
    //         img.src = content;
    //         list.appendChild(img);
    //     });
    // }

    // send scraped content to the serer side 
    if (conversationContent.length > 0) {

        // Assuming the server expects the content as a single string
        let payload = conversationContent.map(content => {
            if (content.startsWith('http')) {
                return { type: 'image', url: content };
            } else {
                return { type: 'text', text: content };
            }
        });

        // URL of your server's `/create-pdf` endpoint
        const serverUrl = 'http://localhost:3000/create-pdf';

        // Send the conversation content to the server
        fetch(serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ conversationContent: payload }),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                const zipUrl = URL.createObjectURL(blob);

                // Create a download link and append it the list
                const downloadLink = document.createElement('a');
                downloadLink.href = zipUrl;
                downloadLink.download = 'combined-pdfs.zip';
                downloadLink.textContent = 'Download PDFs';
                list.appendChild(downloadLink); 
            })
            .catch(error => {
                console.error('Error fetching and processing the PDFs:', error);
                let li = document.createElement('li');
                li.innerText = "Error generating PDFs";
                list.appendChild(li);
            });
    }
});

// 1. Button's click event listener  
scrapeAndSave.addEventListener("click", async () => {

    // get current active tab
    let [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    // execute script to parse conversation content on page
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapePromptsFromAI,
    });
});


// 2. Function to scrape content  
function scrapePromptsFromAI() {

    // Dall E 
    let textSelector = '.w-full.text-token-text-primary';
    let imageSelector = '[aria-label="Show Image"] img';
    let textElements = document.querySelectorAll(textSelector);
    let imageElements = document.querySelectorAll(imageSelector);

    let conversationContent = [];

    textElements.forEach((content) => {
        let text = content.textContent.trim();
        conversationContent.push(text);
    })

    imageElements.forEach((content) => {
        let imageUrl = content.src;
        conversationContent.push(imageUrl);
    })

    chrome.runtime.sendMessage({ conversationContent });
};

