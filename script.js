let allData = [];
let currentLesson = [];
let currentQuestionIndex = 0;
let score = 0;
let currentSubject = ""; 

const menuScreen = document.getElementById('menu-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const subjectButtonsContainer = document.getElementById('subject-buttons');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedbackCard = document.getElementById('feedback-card');
const factsList = document.getElementById('facts-list');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const progressFill = document.getElementById('progress-fill');
const backToMenuBtn = document.getElementById('back-to-menu-btn'); // New Button!

// --- Hardware Back Button Logic (For Mobile) ---
window.addEventListener('popstate', (event) => {
    // If the user presses the phone's back button, go to the menu
    quizScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
});

function returnToMenu() {
    quizScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    history.replaceState({ screen: 'menu' }, ""); // Reset browser history to menu
}

// Visual UI Button Click
backToMenuBtn.onclick = () => {
    if(confirm("Return to Menu? Your progress for these specific questions will be saved.")) {
        returnToMenu();
    }
};
// -----------------------------------------------

function updatePlayerLevel(addXP = false) {
    let stats = JSON.parse(localStorage.getItem('ssc_stats')) || { totalCorrect: 0, currentLevel: 1 };
    if (addXP) {
        stats.totalCorrect += 1;
        stats.currentLevel = Math.floor(stats.totalCorrect / 30) + 1;
        localStorage.setItem('ssc_stats', JSON.stringify(stats));
    }
    document.getElementById('menu-level-badge').innerText = `LEVEL ${stats.currentLevel}`;
}

async function loadGameData() {
    try {
        const response = await fetch('game_data.json');
        allData = await response.json();
        updatePlayerLevel();
        setupMenu();
        // Tell the browser the starting page is the menu
        history.replaceState({ screen: 'menu' }, ""); 
    } catch (error) {
        console.error("Data error:", error);
    }
}

function setupMenu() {
    const subjects = [...new Set(allData.map(q => q.subject))];
    subjectButtonsContainer.innerHTML = "";
    subjects.forEach(subject => {
        const btn = document.createElement('button');
        btn.innerText = subject;
        btn.onclick = () => startLesson(subject);
        subjectButtonsContainer.appendChild(btn);
    });
}

function startLesson(subject) {
    currentSubject = subject; 
    let subjectData = allData.filter(q => q.subject === subject);
    const progress = JSON.parse(localStorage.getItem('ssc_progress')) || {};
    const now = Date.now();
    
    let reviews = [];
    let newQuestions = [];
    
    subjectData.forEach(q => {
        q.userSelected = null; 
        let p = progress[q.id];
        if (!p) {
            newQuestions.push(q);
        } else if (p.nextReview <= now) {
            q.priority = now - p.nextReview; 
            reviews.push(q);
        }
    });
    
    reviews.sort((a, b) => b.priority - a.priority);
    let selectedReviews = reviews.slice(0, 15); 
    let neededNew = 30 - selectedReviews.length; 
    let selectedNew = newQuestions.slice(0, neededNew);
    
    currentLesson = [...selectedReviews, ...selectedNew];
    currentLesson.sort(() => Math.random() - 0.5);
    
    if (currentLesson.length === 0) {
        alert("You have mastered all available questions for this subject! Come back tomorrow.");
        returnToMenu();
        return;
    }
    
    currentQuestionIndex = 0;
    score = 0;
    document.getElementById('subject-title').innerText = subject;
    
    menuScreen.classList.add('hidden');
    resultScreen.classList.add('hidden'); 
    quizScreen.classList.remove('hidden');
    
    // Tell the browser we moved to a new "page" so the back button works
    history.pushState({ screen: 'quiz' }, ""); 
    
    loadQuestion();
}

function parseOptions(rawString) {
    const options = { A: "N/A", B: "N/A", C: "N/A", D: "N/A" };
    const cleanStr = rawString.replace(/\n/g, ' '); 
    const regex = /\(([A-D])\)\s*([^()]+)/g;
    let match;
    while ((match = regex.exec(cleanStr)) !== null) options[match[1]] = match[2].trim();
    return options;
}

function loadQuestion() {
    feedbackCard.classList.add('hidden'); 
    optionsContainer.innerHTML = ""; 
    
    const q = currentLesson[currentQuestionIndex];
    const totalQ = currentLesson.length;
    
    document.getElementById('question-counter').innerText = `${currentQuestionIndex + 1} / ${totalQ}`;
    progressFill.style.width = `${(currentQuestionIndex / totalQ) * 100}%`;
    questionText.innerText = q.question;
    
    if (currentQuestionIndex > 0) {
        prevBtn.classList.remove('hidden');
    } else {
        prevBtn.classList.add('hidden');
    }
    
    const optionsObj = parseOptions(q.raw_options_text);
    ['A', 'B', 'C', 'D'].forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = `${letter}) ${optionsObj[letter]}`;
        
        if (q.userSelected) {
            btn.disabled = true;
            if (letter === q.correct_answer) btn.classList.add('correct');
            if (letter === q.userSelected && letter !== q.correct_answer) btn.classList.add('wrong');
        } else {
            btn.onclick = () => handleAnswer(letter, q.correct_answer, btn, q);
        }
        
        optionsContainer.appendChild(btn);
    });

    if (q.userSelected) {
        showFeedback(q.userSelected === q.correct_answer, q.correct_answer, q);
    }
}

function handleAnswer(selected, correct, btnElement, questionData) {
    const isCorrect = (selected === correct);
    questionData.userSelected = selected; 
    
    optionsContainer.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        if (b.innerText.startsWith(correct)) b.classList.add('correct');
    });

    if (isCorrect) {
        btnElement.classList.add('correct');
        score++;
        updatePlayerLevel(true);
    } else {
        btnElement.classList.add('wrong');
    }
    
    showFeedback(isCorrect, correct, questionData);
    saveProgress(questionData.id, isCorrect);
}

function showFeedback(isCorrect, correct, questionData) {
    if (isCorrect) {
        document.getElementById('feedback-title').innerHTML = "<span style='color:#00ffcc;'>✅ CORRECT</span>";
        feedbackCard.className = "success-border"; 
    } else {
        document.getElementById('feedback-title').innerHTML = `<span style='color:#ff0055;'>❌ INCORRECT</span> <span style="font-size:1rem; color:#ccc;">(Answer: ${correct})</span>`;
        feedbackCard.className = "error-border"; 
    }
    
    factsList.innerHTML = "";
    if (questionData.facts && questionData.facts.length > 0) {
        questionData.facts.forEach(fact => {
            const li = document.createElement('li');
            li.innerHTML = fact.replace('→', '<strong style="color:#00ffcc;">→</strong>');
            factsList.appendChild(li);
        });
    } else {
        factsList.innerHTML = "<li>No important one-liners available.</li>";
    }
    
    feedbackCard.classList.remove('hidden');
}

function saveProgress(questionId, isCorrect) {
    let progress = JSON.parse(localStorage.getItem('ssc_progress')) || {};
    let now = Date.now();
    let oneDay = 24 * 60 * 60 * 1000;
    
    if (!progress[questionId]) progress[questionId] = { streak: 0 };
    
    if (isCorrect) {
        progress[questionId].streak += 1;
        let daysToAdd = progress[questionId].streak === 1 ? 1 : progress[questionId].streak === 2 ? 3 : 7;
        progress[questionId].nextReview = now + (daysToAdd * oneDay);
    } else {
        progress[questionId].streak = 0;
        progress[questionId].nextReview = now + oneDay; 
    }
    localStorage.setItem('ssc_progress', JSON.stringify(progress));
}

nextBtn.onclick = () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentLesson.length) {
        loadQuestion();
    } else {
        quizScreen.classList.add('hidden');
        resultScreen.classList.remove('hidden');
        document.getElementById('final-score').innerText = `Score: ${score}/${currentLesson.length}`;
        progressFill.style.width = "100%";
        
        let stats = JSON.parse(localStorage.getItem('ssc_stats')) || { totalCorrect: 0, currentLevel: 1 };
        if (score > 0 && stats.totalCorrect % 30 < score) {
            document.getElementById('level-up-msg').classList.remove('hidden');
        } else {
            document.getElementById('level-up-msg').classList.add('hidden');
        }
    }
};

prevBtn.onclick = () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        loadQuestion();
    }
};

document.getElementById('next-set-btn').onclick = () => {
    startLesson(currentSubject);
};

document.getElementById('review-btn').onclick = () => {
    currentQuestionIndex = 0;
    resultScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    loadQuestion();
};

loadGameData();
