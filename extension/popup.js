let scrapeAndSave = document.getElementById('scrapeAndSave');
let list = document.getElementById('promptConversation');
// set the save button as the parent node
let parentContainer = scrapeAndSave.parentNode;


// 3. handler to receive conversation from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    let conversationContent = request.conversationContent;

    // //Display conversation on pupup
    if (conversationContent == null || conversationContent.length == 0) {

        // no content
        let li = document.createElement('li');
        li.innerText = "No conversation found";
        list.appendChild(li);
    }
    else {

        conversationContent.forEach((content) => {
            // if (!(content.startsWith('http'))) {
            //     let li = document.createElement('li');
            //     li.innerText = content;
            //     list.appendChild(li);
            // }
            if (isValidHttpUrl(content)) {
                const container = document.createElement('div');
                container.classList.add('image-container');

                const radioInput = document.createElement('input');
                radioInput.name = 'image-selection';
                radioInput.classList.add('image-selection');
                radioInput.type = 'radio';
                // set the function to send the image to the register 
                radioInput.onchange = handleImageSelect;

                let img = document.createElement('img');
                img.src = content;
                img.classList.add('scraped-images');
                container.append(radioInput);
                container.append(img);
                list.append(container);
            }
        });
    }

    // send scraped content to the serer side 
    if (conversationContent.length > 0) {
        let payload = conversationContent.map(content => {
            if (content.startsWith('http')) {
                return { type: 'image', url: content };
            } else {
                return { type: 'text', text: content };
            }
        });

        const serverUrl = 'http://localhost:3000/create-pdf';

        // creating the waiting message while waiting for PDFs
        const waitingMessage = document.createElement('div');
        waitingMessage.textContent = "Creating the Certificate and the Creative process, please wait...";
        waitingMessage.classList.add('waiting-message');
        parentContainer.insertBefore(waitingMessage, scrapeAndSave.nextSibling);

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
                downloadLink.classList.add('download-link');
                list.appendChild(downloadLink);
                // set teh downloadLink to display right after the save button
                parentContainer.insertBefore(downloadLink, scrapeAndSave.nextSibling);

                waitingMessage.textContent = "Download ready! Please download the PDFs by clicking on the above button";

                const textElement = document.createElement('div');
                textElement.textContent = "Please choose your final artwork to display in our registry";
                textElement.classList.add('custom-text');
                list.appendChild(textElement);
                parentContainer.insertBefore(textElement, waitingMessage.nextSibling);


            })
            .catch(error => {
                console.error('Error fetching and processing the PDFs:', error);
                let li = document.createElement('li');
                li.innerText = "Error generating PDFs";
                list.appendChild(li);
                parentContainer.insertBefore(li, scrapeAndSave.nextSibling);
            });
    }
});


// handle when the image is selected
function handleImageSelect(event) {
    // Find the image container
    const container = event.target.parentElement;

    // Remove existing 'Select' buttons to ensure there's only one at a time
    const existingButtons = container.querySelectorAll('.select-btn');
    existingButtons.forEach(btn => btn.remove());

    // Create a new 'Select' button
    const selectButton = document.createElement('button');
    selectButton.innerText = 'Select';
    selectButton.classList.add('select-btn');
    // Add the button to the container
    container.appendChild(selectButton);

    // Add an event listener to the 'Select' button
    selectButton.addEventListener('click', () => {
        handleSelectButtonClick(container);
    });
}

// handle select button to send image to the registry
function handleSelectButtonClick(container) {
    const img = container.querySelector('img');
    console.log('Image URL:', img.src);

    const serverUrl = 'http://localhost:3000/upload-image';

    fetch(serverUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: img.src }),
    })
        .then(response => response.json())
        .then(data => console.log(data))
        .catch(error => console.error('Error:', error));

}


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

    // text selectors for Dall E: 'div[data-message-author-role="user"], div[data-message-author-role="assistant"]'
    // image selector for Dall E: '[aria-label="Show Image"] img'
    // text selector for Midjourney: 'span' and '.markup_a7e664.messageContent__21e69 strong'
    // image selector for Midjourney: '.mediaAttachmentsContainer_edba75 img'
    // text selector for Stable Diffusion: '#prompts'
    // image selector for Stable Diffusion: 'div.h-full.w-full.cursor-pointer img'
    // not used - text selector for Copilot: 'cib-message-group[source="user"] .content.text-message-content div[role="heading"]'

    let textSelectorDallEUser = document.querySelectorAll('div[data-message-author-role="user"]');
    let textSelectorDallEAssistant = document.querySelectorAll('div[data-message-author-role="assistant"]');
    let textSelectorMidjourney = document.querySelectorAll('span');
    let textSelectorSD = document.querySelectorAll('#prompts');
    let imageSelectorDallE = document.querySelectorAll('[aria-label="Show Image"] img');
    let imageSelectorMidjourney = document.querySelectorAll('.mediaAttachmentsContainer_edba75 img');
    let imageSelectorSD = document.querySelectorAll('div.h-full.w-full.cursor-pointer img');

    let conversationContent = [];

    //for midjourney only
    function checkConditionSpan(span) {
        return span.classList.contains('mention') &&
            span.classList.contains('wrapper_f46140') &&
            span.classList.contains('interactive');
    }

    if (textSelectorMidjourney.length > 0) {
        let imageIndex = 0;
        textSelectorMidjourney.forEach((span) => {
            let textAdded = false;

            if (checkConditionSpan(span)) {
                // Get the parent element
                const parent = span.parentElement;
                // Find strong within the parent
                const strong = parent.querySelector('strong');
                if (strong) {
                    let text = strong.textContent.trim();
                    conversationContent.push(text);
                    textAdded = true;
                }
            }
            // attach images 
            if (textAdded && imageSelectorMidjourney[imageIndex]) {
                let imageUrl = imageSelectorMidjourney[imageIndex].src;
                conversationContent.push(imageUrl);
                imageIndex++;
            }
        });
    }
    if (textSelectorDallEUser.length > 0) {
        for (let i = 0; i < textSelectorDallEUser.length; i++) {
            let textI = textSelectorDallEUser[i].textContent.trim();
            conversationContent.push(textI);
            if (i < textSelectorDallEAssistant.length) {
                let textJ = textSelectorDallEAssistant[i].textContent.trim();
                conversationContent.push(textJ);

                //attaching images
                let imageUrl1 = imageSelectorDallE[i].src;
                conversationContent.push(imageUrl1);
                let imageUrl2 = imageSelectorDallE[i + 1].src;
                conversationContent.push(imageUrl2);
            }
        }
    }
    if (textSelectorSD.length > 0) {
        textSelectorSD.forEach((content, i) => {
            let text = content.textContent.trim();
            conversationContent.push(text);

            //attach images
            let imageUrl = imageSelectorSD[i].src;
            conversationContent.push(imageUrl);
        });
    }

    console.log('check display order:' + conversationContent);

    chrome.runtime.sendMessage({ conversationContent });
}

// check real url
function isValidHttpUrl(string) {
    let url;
    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
}