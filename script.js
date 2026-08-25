// WebLLM dynamically imported when needed
let vocabList = [];
let currentFlashcardIndex = 0;
let testPairs = [];
let webllmEngine = null;

// DOM Elements
const sectionInput = document.getElementById('input-section');
const sectionMode = document.getElementById('mode-selection');
const sectionFlashcards = document.getElementById('flashcards-section');
const sectionTest = document.getElementById('test-section');

const vocabInput = document.getElementById('vocab-input');
const btnParse = document.getElementById('btn-parse');
const vocabCountDisplay = document.getElementById('vocab-count');

const btnFlashcards = document.getElementById('btn-flashcards');
const btnTest = document.getElementById('btn-test');
const testCountInput = document.getElementById('test-count');
const btnBackInput = document.getElementById('btn-back-input');
const btnsBackMenu = document.querySelectorAll('.btn-back-menu');

// Flashcard Elements
const flashcard = document.getElementById('flashcard');
const fcTerm = document.getElementById('fc-term');
const fcDef = document.getElementById('fc-def');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const fcCounter = document.getElementById('fc-counter');

// Test Elements
const termsColumn = document.getElementById('terms-column');
const defsColumn = document.getElementById('defs-column');
const btnSubmitTest = document.getElementById('btn-submit-test');
const btnResetTest = document.getElementById('btn-reset-test');
const testResults = document.getElementById('test-results');
const searchTerms = document.getElementById('search-terms');
const searchDefs = document.getElementById('search-defs');

const alterDefsCheckbox = document.getElementById('alter-defs-checkbox');
const aiStatus = document.getElementById('ai-status');

// --- Navigation ---
function showSection(section) {
    [sectionInput, sectionMode, sectionFlashcards, sectionTest].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

// --- Parsing ---
btnParse.addEventListener('click', () => {
    const text = vocabInput.value.trim();
    if (!text) {
        alert("Please enter some vocabulary!");
        return;
    }

    vocabList = [];
    const normalizedText = text.replace(/\r\n/g, '\n');
    const chunks = normalizedText.split(/\n\n+/);

    chunks.forEach(chunk => {
        const lines = chunk.split('\n');
        if (lines.length >= 2) {
            const term = lines[0].trim();
            const def = lines.slice(1).join(' ').trim();
            if (term && def) {
                vocabList.push({ term, def });
            }
        }
    });

    if (vocabList.length === 0) {
        alert("Could not parse vocabulary. Please follow the 'Term\\nDefinition' format separated by an empty line.");
        return;
    }

    vocabCountDisplay.textContent = vocabList.length;
    testCountInput.max = vocabList.length;
    testCountInput.value = vocabList.length;
    
    showSection(sectionMode);
});

btnBackInput.addEventListener('click', () => showSection(sectionInput));
btnsBackMenu.forEach(btn => btn.addEventListener('click', () => showSection(sectionMode)));

// --- Flashcards ---
btnFlashcards.addEventListener('click', () => {
    currentFlashcardIndex = 0;
    updateFlashcard();
    flashcard.classList.remove('is-flipped');
    showSection(sectionFlashcards);
});

flashcard.addEventListener('click', () => {
    flashcard.classList.toggle('is-flipped');
});

btnNext.addEventListener('click', () => {
    if (currentFlashcardIndex < vocabList.length - 1) {
        currentFlashcardIndex++;
        flashcard.classList.remove('is-flipped');
        setTimeout(updateFlashcard, 150);
    }
});

btnPrev.addEventListener('click', () => {
    if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        flashcard.classList.remove('is-flipped');
        setTimeout(updateFlashcard, 150);
    }
});

function updateFlashcard() {
    fcTerm.textContent = vocabList[currentFlashcardIndex].term;
    fcDef.textContent = vocabList[currentFlashcardIndex].def;
    fcCounter.textContent = `${currentFlashcardIndex + 1} / ${vocabList.length}`;
}

// --- Drag & Drop Test ---
btnTest.addEventListener('click', async () => {
    let count = parseInt(testCountInput.value);
    if (isNaN(count) || count < 1) count = 1;
    if (count > vocabList.length) count = vocabList.length;

    await generateTest(count);
    showSection(sectionTest);
});

btnResetTest.addEventListener('click', async () => {
    await generateTest(testPairs.length);
});

async function alterDefinitionsWithWebLLM(pairs) {
    if (!webllmEngine) {
        aiStatus.textContent = "Loading AI Model into browser (this takes a while on first run)...";
        btnTest.disabled = true;
        try {
            const { CreateMLCEngine } = await import("https://esm.run/@mlc-ai/web-llm");
            webllmEngine = await CreateMLCEngine("Qwen2.5-0.5B-Instruct-q4f16_1-MLC", {
                initProgressCallback: (progress) => {
                    aiStatus.textContent = progress.text;
                }
            });
        } catch (err) {
            console.error(err);
            aiStatus.textContent = "Failed to load WebLLM model. Falling back to original.";
            btnTest.disabled = false;
            return pairs;
        }
    }
    
    aiStatus.textContent = "Altering definitions with WebLLM... Please wait.";
    btnTest.disabled = true;
    
    let altered = [];
    for (let i = 0; i < pairs.length; i++) {
        let item = pairs[i];
        try {
            const messages = [
                { 
                    role: "system", 
                    content: "You are an expert educational examiner creating test questions. Your task is to paraphrase the provided definition for a term so students test conceptual understanding rather than rote memorization.\n\nStrict Rules:\n1. Maintain 100% factual and contextual accuracy.\n2. Rephrase sentence structure and substitute key synonyms.\n3. DO NOT include the term itself or any variation of the term in the rewritten definition.\n4. DO NOT add conversational filler (e.g., 'Here is...', 'Sure!', quotes, or prefixes).\n5. Return ONLY the rewritten definition text." 
                },
                { 
                    role: "user", 
                    content: `Term: ${item.term}\nOriginal Definition: ${item.def}\n\nRewritten Definition:` 
                }
            ];
            const reply = await webllmEngine.chat.completions.create({
                messages,
                temperature: 0.4,
                max_tokens: 150
            });
            let resultText = reply.choices[0].message.content.trim();
            // Clean up any stray quotes or prefixes if present
            resultText = resultText.replace(/^(Rewritten Definition:|"|')/i, '').replace(/("|\')$/, '').trim();
            altered.push({ term: item.term, def: resultText || item.def });
        } catch (err) {
            console.error("WebLLM generation error:", err);
            altered.push(item);
        }
    }
    
    aiStatus.textContent = "Definitions successfully altered!";
    setTimeout(() => aiStatus.textContent = "", 3000);
    btnTest.disabled = false;
    return altered;
}

async function generateTest(count) {
    termsColumn.innerHTML = '';
    defsColumn.innerHTML = '';
    testResults.classList.add('hidden');
    testResults.textContent = '';
    
    if (searchTerms) searchTerms.value = '';
    if (searchDefs) searchDefs.value = '';
    
    // Select random words
    let shuffledVocab = [...vocabList].sort(() => 0.5 - Math.random());
    let selectedPairs = shuffledVocab.slice(0, count);

    if (alterDefsCheckbox && alterDefsCheckbox.checked) {
        testPairs = await alterDefinitionsWithWebLLM(selectedPairs);
    } else {
        testPairs = selectedPairs;
    }

    // Create terms (drop zones) and defs (draggables)
    let terms = [...testPairs];
    let defs = [...testPairs].sort(() => 0.5 - Math.random());

    terms.forEach((item, index) => {
        const termBox = document.createElement('div');
        termBox.className = 'term-box';
        
        const heading = document.createElement('h3');
        heading.textContent = item.term;
        
        const dropZone = document.createElement('div');
        dropZone.className = 'drop-zone';
        dropZone.dataset.termIndex = index;
        dropZone.dataset.term = item.term;

        // Drop zone events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const defId = e.dataTransfer.getData('text/plain');
            const draggedEl = document.getElementById(defId);
            
            if (draggedEl) {
                // If the drop zone already has an item, move it back to the defs column
                if (dropZone.children.length > 0) {
                    defsColumn.appendChild(dropZone.children[0]);
                }
                dropZone.appendChild(draggedEl);
                
                // Move the term box to the bottom of the list
                const parentTermBox = dropZone.closest('.term-box');
                if (parentTermBox) {
                    termsColumn.appendChild(parentTermBox);
                }
            }
        });

        termBox.appendChild(heading);
        termBox.appendChild(dropZone);
        termsColumn.appendChild(termBox);
    });

    defs.forEach((item, index) => {
        const defItem = document.createElement('div');
        defItem.className = 'def-item';
        defItem.draggable = true;
        defItem.id = `def-${index}`;
        defItem.dataset.def = item.def;
        defItem.dataset.term = item.term; // Correct answer reference
        defItem.textContent = item.def;

        defItem.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', defItem.id);
            setTimeout(() => { defItem.style.opacity = '0.5'; }, 0);
        });

        defItem.addEventListener('dragend', () => {
            defItem.style.opacity = '1';
        });

        defsColumn.appendChild(defItem);
    });
    
    // Add event for returning to defs column
    defsColumn.addEventListener('dragover', (e) => e.preventDefault());
    defsColumn.addEventListener('drop', (e) => {
        e.preventDefault();
        const defId = e.dataTransfer.getData('text/plain');
        const draggedEl = document.getElementById(defId);
        if (draggedEl) {
            defsColumn.appendChild(draggedEl);
        }
    });
}

btnSubmitTest.addEventListener('click', () => {
    const dropZones = document.querySelectorAll('.drop-zone');
    let score = 0;
    
    dropZones.forEach(zone => {
        const term = zone.dataset.term;
        zone.classList.remove('correct', 'incorrect');
        
        if (zone.children.length > 0) {
            const defItem = zone.children[0];
            if (defItem.dataset.term === term) {
                zone.classList.add('correct');
                score++;
            } else {
                zone.classList.add('incorrect');
            }
        }
    });
    
    testResults.textContent = `You scored ${score} out of ${testPairs.length}!`;
    testResults.classList.remove('hidden');
});

// --- Search Logic ---
if (searchTerms) {
    searchTerms.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const termBoxes = termsColumn.querySelectorAll('.term-box');
        termBoxes.forEach(box => {
            const term = box.querySelector('h3').textContent.toLowerCase();
            box.style.display = term.includes(query) ? 'flex' : 'none';
        });
    });
}

if (searchDefs) {
    searchDefs.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        // Only search definitions that are currently inside the defsColumn (not dropped in terms)
        const defItems = defsColumn.querySelectorAll('.def-item');
        defItems.forEach(item => {
            const defText = item.textContent.toLowerCase();
            item.style.display = defText.includes(query) ? 'block' : 'none';
        });
    });
}
