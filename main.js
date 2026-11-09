import {
    HandLandmarker,
    FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ==========================================
// ELEMENTS
// ==========================================

const video = document.getElementById("webcam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const statusText = document.getElementById("status");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartCamera");
const stopButton = document.getElementById("stopCamera");
const exitCameraButton = document.getElementById("exitCamera");

const cameraPage = document.getElementById("cameraPage");
const homePage = document.getElementById("homePage");
const mainNavbar = document.getElementById("mainNavbar");
const mainFooter = document.getElementById("mainFooter");

const photoProgress = document.getElementById("photoProgress");
const gestureDescription = document.getElementById("gestureDescription");
const nextPhotoButton = document.getElementById("nextPhotoButton");

const resultPage = document.getElementById("resultPage");
const editorCanvas = document.getElementById("photoboxEditorCanvas");
const editorCtx = editorCanvas.getContext("2d");

const downloadButton = document.getElementById("downloadButton");
const newSessionButton = document.getElementById("newSessionButton");

const layoutCards = document.querySelectorAll(".layout-card");
const layoutHint = document.getElementById("layoutHint");

// Sticker editor elements
const stickerGrid = document.getElementById("stickerGrid");
const stickerCategories = document.getElementById("stickerCategories");
const stickerSelectionLabel = document.getElementById("stickerSelectionLabel");

const stickerSmallerButton = document.getElementById("stickerSmaller");
const stickerLargerButton = document.getElementById("stickerLarger");
const stickerRotateButton = document.getElementById("stickerRotate");
const stickerDeleteButton = document.getElementById("stickerDelete");
const stickerUndoButton = document.getElementById("stickerUndo");
const stickerResetButton = document.getElementById("stickerReset");

// ==========================================
// CONFIGURATION
// ==========================================

const COUNTDOWN_DURATION = 5000;

const PHOTO_PINCH_THRESHOLD = 0.09;

const PUZZLE_PINCH_START_THRESHOLD = 0.30;
const PUZZLE_PINCH_RELEASE_THRESHOLD = 0.42;

const PUZZLE_SIZE = 3;
const PUZZLE_TOTAL = 9;

// ==========================================
// SESSION STATE
// ==========================================

let selectedLayout = null;
let totalPhotos = 0;
let currentPhotoNumber = 1;

let completedPhotos = [];
let finalPhotoboxCanvas = null;

// ==========================================
// CAMERA STATE
// ==========================================

let handLandmarker = null;
let cameraStream = null;
let animationId = null;

let lastVideoTime = -1;
let currentHands = [];

// ==========================================
// PHOTO STATE
// ==========================================

let countdownStartTime = null;
let lockedFrame = null;
let photoTaken = false;

const capturedPhoto = document.createElement("canvas");

// ==========================================
// PUZZLE STATE
// ==========================================

let puzzleActive = false;
let puzzleSolved = false;
let puzzleTiles = [];

let draggedTileIndex = null;
let dragPosition = null;
let pinchWasActive = false;

// ==========================================
// PREVIEW ELEMENT
// ==========================================

let previewPanel = null;

// ==========================================
// STICKER EDITOR STATE
// ==========================================

let stickers = [];
let selectedStickerId = null;
let stickerHistory = [];
let stickerIdCounter = 0;

let isDraggingSticker = false;
let dragOffset = { x: 0, y: 0 };

// ==========================================
// BUILT-IN STICKERS
// ==========================================

const builtInStickers = [
    { emoji: "❤️", category: "love", name: "Heart" },
    { emoji: "💕", category: "love", name: "Two Hearts" },
    { emoji: "💗", category: "love", name: "Pink Heart" },
    { emoji: "💖", category: "love", name: "Sparkling Heart" },
    { emoji: "💘", category: "love", name: "Heart Arrow" },
    { emoji: "💌", category: "love", name: "Love Letter" },

    { emoji: "🌸", category: "nature", name: "Cherry Blossom" },
    { emoji: "🌻", category: "nature", name: "Sunflower" },
    { emoji: "🌷", category: "nature", name: "Tulip" },
    { emoji: "🌼", category: "nature", name: "Flower" },
    { emoji: "🍀", category: "nature", name: "Clover" },
    { emoji: "🌿", category: "nature", name: "Leaf" },

    { emoji: "🎀", category: "cute", name: "Ribbon" },
    { emoji: "🧸", category: "cute", name: "Teddy Bear" },
    { emoji: "🐰", category: "cute", name: "Bunny" },
    { emoji: "🐱", category: "cute", name: "Cat" },
    { emoji: "🦋", category: "cute", name: "Butterfly" },
    { emoji: "👼", category: "cute", name: "Angel" },

    { emoji: "⭐", category: "fun", name: "Star" },
    { emoji: "✨", category: "fun", name: "Sparkles" },
    { emoji: "☁️", category: "fun", name: "Cloud" },
    { emoji: "🌈", category: "fun", name: "Rainbow" },
    { emoji: "☀️", category: "fun", name: "Sun" },
    { emoji: "😎", category: "fun", name: "Cool Face" },
    { emoji: "🥰", category: "fun", name: "Smiling Face" },
];

// ==========================================
// LAYOUT SELECTION
// ==========================================

function normalizeLayout(value) {
    const normalized = String(value || "").toLowerCase();

    if (
        normalized === "four" ||
        normalized === "4" ||
        normalized.includes("4-photo") ||
        normalized.includes("4_photo")
    ) {
        return "four";
    }

    if (normalized === "horizontal") return "horizontal";
    if (normalized === "vertical") return "vertical";

    return null;
}

function getPhotoCount(layout) {
    return layout === "four" ? 4 : 3;
}

layoutCards.forEach((card) => {
    card.addEventListener("click", () => {
        layoutCards.forEach((item) => {
            item.classList.remove("selected");
        });

        card.classList.add("selected");

        selectedLayout = normalizeLayout(card.dataset.layout);

        if (!selectedLayout) {
            startButton.disabled = true;
            layoutHint.textContent = "Layout tidak dikenali.";
            return;
        }

        startButton.disabled = false;

        const names = {
            vertical: "3 Photos Vertical",
            horizontal: "3 Photos Horizontal",
            four: "4 Photos",
        };

        layoutHint.textContent =
            `${names[selectedLayout]} selected. Ready to start!`;
    });
});

// ==========================================
// SESSION START
// ==========================================

async function startPhotoSession() {
    if (!selectedLayout) return;

    totalPhotos = getPhotoCount(selectedLayout);
    currentPhotoNumber = 1;
    completedPhotos = [];
    finalPhotoboxCanvas = null;

    resultPage.classList.add("hidden");
    homePage.classList.add("hidden");
    mainNavbar.classList.add("hidden");
    mainFooter.classList.add("hidden");

    cameraPage.classList.remove("hidden");

    createPreviewPanel();
    updatePreviewPanel();
    updatePhotoProgress();

    gestureDescription.textContent =
        "Position both hands to create a frame. Pinch your thumb and middle finger to take a photo.";

    await startCamera();
}

function updatePhotoProgress() {
    photoProgress.textContent =
        `PHOTO ${currentPhotoNumber} OF ${totalPhotos}`;
}

// ==========================================
// PREVIOUS PHOTO PREVIEW
// ==========================================

function createPreviewPanel() {
    if (previewPanel) previewPanel.remove();

    previewPanel = document.createElement("aside");
    previewPanel.className = "photo-preview-panel";
    previewPanel.id = "photoPreviewPanel";

    previewPanel.innerHTML = `
        <div class="preview-heading">
            <span>YOUR PHOTOS</span>
            <span class="preview-counter"></span>
        </div>
        <div class="preview-thumbnails"></div>
    `;

    cameraPage.appendChild(previewPanel);
}

function updatePreviewPanel() {
    if (!previewPanel) return;

    const thumbnails = previewPanel.querySelector(".preview-thumbnails");
    const counter = previewPanel.querySelector(".preview-counter");

    counter.textContent = `${completedPhotos.length}/${totalPhotos}`;
    thumbnails.innerHTML = "";

    for (let i = 0; i < totalPhotos; i++) {
        const item = document.createElement("div");
        item.className = "preview-item";

        if (completedPhotos[i]) {
            item.classList.add("completed");

            const image = document.createElement("img");
            image.src = completedPhotos[i].toDataURL("image/jpeg", 0.85);
            image.alt = `Photo ${i + 1}`;

            item.appendChild(image);
        } else {
            item.classList.add("empty");

            const number = document.createElement("span");
            number.textContent = String(i + 1).padStart(2, "0");

            item.appendChild(number);
        }

        thumbnails.appendChild(item);
    }
}

// ==========================================
// MEDIAPIPE INITIALIZATION
// ==========================================

async function initializeHandLandmarker() {
    if (handLandmarker) return;

    statusText.textContent = "Loading hand detection...";

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "CPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
        }
    );
}

// ==========================================
// CAMERA INITIALIZATION
// ==========================================

async function initializeCamera() {
    statusText.textContent = "Opening camera...";

    cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user",
        },
        audio: false,
    });

    video.srcObject = cameraStream;

    await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
    });

    await video.play();

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    statusText.textContent =
        "Position both hands to create a frame.";
}

// ==========================================
// HAND DETECTION
// ==========================================

function detectHands() {
    if (!handLandmarker || video.readyState < 2) return [];

    if (video.currentTime === lastVideoTime) return currentHands;

    lastVideoTime = video.currentTime;

    const result = handLandmarker.detectForVideo(
        video,
        performance.now()
    );

    currentHands = result.landmarks || [];

    return currentHands;
}

// ==========================================
// DISTANCE
// ==========================================

function getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = (a.z || 0) - (b.z || 0);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ==========================================
// PHOTO GESTURE
// ==========================================

function isPhotoGesture(hand) {
    if (!hand || hand.length < 21) return false;

    const pinchDistance = getDistance(hand[4], hand[12]);
    const palmSize = getDistance(hand[0], hand[9]);

    if (palmSize === 0) return false;

    return pinchDistance / palmSize < PHOTO_PINCH_THRESHOLD;
}

function detectPhotoGesture(hands) {
    return hands.some(isPhotoGesture);
}

// ==========================================
// PUZZLE PINCH
// ==========================================

function getPuzzlePinchInfo(hands) {
    for (const hand of hands) {
        if (!hand || hand.length < 21) continue;

        const thumb = hand[4];
        const index = hand[8];

        const distance = getDistance(thumb, index);
        const palmSize = getDistance(hand[0], hand[9]);

        if (palmSize === 0) continue;

        const ratio = distance / palmSize;

        const threshold = pinchWasActive
            ? PUZZLE_PINCH_RELEASE_THRESHOLD
            : PUZZLE_PINCH_START_THRESHOLD;

        return {
            active: ratio < threshold,
            x: ((thumb.x + index.x) / 2) * overlay.width,
            y: ((thumb.y + index.y) / 2) * overlay.height,
        };
    }

    return { active: false, x: null, y: null };
}

// ==========================================
// HAND FRAME
// ==========================================

function getFrameRect(hands) {
    if (!hands || hands.length < 2) return null;

    const points = [
        hands[0][4],
        hands[0][8],
        hands[1][4],
        hands[1][8],
    ];

    const xs = points.map(p => p.x * overlay.width);
    const ys = points.map(p => p.y * overlay.height);

    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    const width = right - left;
    const height = bottom - top;

    if (width < 45 || height < 45) return null;

    return { left, top, width, height };
}

// ==========================================
// DRAW HANDS
// ==========================================

function drawHands(hands) {
    for (const hand of hands) {
        ctx.strokeStyle = "#36D6D0";
        ctx.lineWidth = Math.max(2, overlay.width / 320);

        for (const connection of HandLandmarker.HAND_CONNECTIONS) {
            const start = hand[connection.start];
            const end = hand[connection.end];

            ctx.beginPath();
            ctx.moveTo(start.x * overlay.width, start.y * overlay.height);
            ctx.lineTo(end.x * overlay.width, end.y * overlay.height);
            ctx.stroke();
        }

        for (const point of hand) {
            ctx.beginPath();
            ctx.arc(
                point.x * overlay.width,
                point.y * overlay.height,
                Math.max(3, overlay.width / 160),
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
        }
    }
}

// ==========================================
// DRAW FRAME
// ==========================================

function drawFrameOverlay(frame) {
    if (!frame) return;

    ctx.fillStyle = "rgba(40,40,40,0.65)";
    ctx.fillRect(0, 0, overlay.width, overlay.height);

    ctx.clearRect(frame.left, frame.top, frame.width, frame.height);

    ctx.strokeStyle = "#F4C45E";
    ctx.lineWidth = Math.max(3, overlay.width / 240);

    ctx.setLineDash([
        Math.max(8, overlay.width / 100),
        Math.max(5, overlay.width / 160),
    ]);

    ctx.strokeRect(frame.left, frame.top, frame.width, frame.height);
    ctx.setLineDash([]);
}

// ==========================================
// COUNTDOWN
// ==========================================

function drawCountdown(seconds) {
    const x = overlay.width / 2;
    const y = overlay.height / 2;
    const radius = overlay.width * .065;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${overlay.width * .07}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(seconds, x, y);
}

function startCountdown(frame) {
    if (countdownStartTime !== null || !frame) return;

    lockedFrame = { ...frame };
    countdownStartTime = performance.now();

    statusText.textContent = "Frame locked! Get ready to pose...";
}

function handleCountdown(currentTime) {
    if (countdownStartTime === null || !lockedFrame) return;

    const elapsed = currentTime - countdownStartTime;
    const remaining = COUNTDOWN_DURATION - elapsed;

    if (remaining <= 0) {
        capturePhoto(lockedFrame);
        return;
    }

    const seconds = Math.ceil(remaining / 1000);

    statusText.textContent = `Photo in ${seconds} seconds!`;
    drawCountdown(seconds);
}

// ==========================================
// CAPTURE PHOTO
// ==========================================

function capturePhoto(frame) {
    if (!frame || photoTaken) return;

    photoTaken = true;

    const cropX = overlay.width - (frame.left + frame.width);

    capturedPhoto.width = Math.round(frame.width);
    capturedPhoto.height = Math.round(frame.height);

    const photoCtx = capturedPhoto.getContext("2d");

    photoCtx.imageSmoothingEnabled = true;
    photoCtx.imageSmoothingQuality = "high";

    photoCtx.save();
    photoCtx.translate(capturedPhoto.width, 0);
    photoCtx.scale(-1, 1);

    photoCtx.drawImage(
        video,
        cropX,
        frame.top,
        frame.width,
        frame.height,
        0,
        0,
        capturedPhoto.width,
        capturedPhoto.height
    );

    photoCtx.restore();

    shufflePuzzle();

    puzzleActive = true;
    puzzleSolved = false;

    draggedTileIndex = null;
    dragPosition = null;
    pinchWasActive = false;

    countdownStartTime = null;
    nextPhotoButton.classList.add("hidden");

    statusText.textContent = "Arrange the puzzle using your fingers.";
}

// ==========================================
// PUZZLE SHUFFLE
// ==========================================

function shufflePuzzle() {
    puzzleTiles = Array.from({ length: PUZZLE_TOTAL }, (_, index) => index);

    for (let i = puzzleTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [puzzleTiles[i], puzzleTiles[j]] =
            [puzzleTiles[j], puzzleTiles[i]];
    }

    if (puzzleTiles.every((tile, index) => tile === index)) {
        [puzzleTiles[0], puzzleTiles[1]] =
            [puzzleTiles[1], puzzleTiles[0]];
    }
}

// ==========================================
// PUZZLE GRID
// ==========================================

function getPuzzleCellSize() {
    if (!lockedFrame) return null;

    return {
        width: lockedFrame.width / PUZZLE_SIZE,
        height: lockedFrame.height / PUZZLE_SIZE,
    };
}

function getPuzzleCellIndex(x, y) {
    if (!lockedFrame) return -1;

    const cell = getPuzzleCellSize();

    const relativeX = x - lockedFrame.left;
    const relativeY = y - lockedFrame.top;

    if (
        relativeX < 0 ||
        relativeY < 0 ||
        relativeX >= lockedFrame.width ||
        relativeY >= lockedFrame.height
    ) {
        return -1;
    }

    const col = Math.floor(relativeX / cell.width);
    const row = Math.floor(relativeY / cell.height);

    return row * PUZZLE_SIZE + col;
}

// ==========================================
// PUZZLE MOVEMENT
// ==========================================

function handlePuzzleMovement(hands) {
    if (!puzzleActive || puzzleSolved) return;

    const pinch = getPuzzlePinchInfo(hands);

    if (pinch.active) {
        dragPosition = { x: pinch.x, y: pinch.y };

        if (!pinchWasActive && draggedTileIndex === null) {
            const selected = getPuzzleCellIndex(pinch.x, pinch.y);

            if (selected !== -1) draggedTileIndex = selected;
        }
    } else {
        if (
            pinchWasActive &&
            draggedTileIndex !== null &&
            dragPosition !== null
        ) {
            const target = getPuzzleCellIndex(
                dragPosition.x,
                dragPosition.y
            );

            if (target !== -1 && target !== draggedTileIndex) {
                [
                    puzzleTiles[draggedTileIndex],
                    puzzleTiles[target],
                ] = [
                    puzzleTiles[target],
                    puzzleTiles[draggedTileIndex],
                ];
            }

            draggedTileIndex = null;
            dragPosition = null;

            checkPuzzleSolved();
        }
    }

    pinchWasActive = pinch.active;
}

// ==========================================
// DRAW PUZZLE
// ==========================================

function drawPuzzle() {
    if (!lockedFrame || !capturedPhoto.width) return;

    const cell = getPuzzleCellSize();
    const frame = lockedFrame;

    const sourceWidth = capturedPhoto.width / PUZZLE_SIZE;
    const sourceHeight = capturedPhoto.height / PUZZLE_SIZE;

    for (let i = 0; i < PUZZLE_TOTAL; i++) {
        if (i === draggedTileIndex) continue;

        const row = Math.floor(i / PUZZLE_SIZE);
        const col = i % PUZZLE_SIZE;
        const tileId = puzzleTiles[i];

        const sourceRow = Math.floor(tileId / PUZZLE_SIZE);
        const sourceCol = tileId % PUZZLE_SIZE;

        ctx.drawImage(
            capturedPhoto,
            sourceCol * sourceWidth,
            sourceRow * sourceHeight,
            sourceWidth,
            sourceHeight,
            frame.left + col * cell.width,
            frame.top + row * cell.height,
            cell.width,
            cell.height
        );

        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = Math.max(2, overlay.width / 400);

        ctx.strokeRect(
            frame.left + col * cell.width,
            frame.top + row * cell.height,
            cell.width,
            cell.height
        );
    }

    if (draggedTileIndex !== null && dragPosition !== null) {
        const tileId = puzzleTiles[draggedTileIndex];

        const sourceRow = Math.floor(tileId / PUZZLE_SIZE);
        const sourceCol = tileId % PUZZLE_SIZE;

        ctx.save();
        ctx.globalAlpha = .9;

        ctx.drawImage(
            capturedPhoto,
            sourceCol * sourceWidth,
            sourceRow * sourceHeight,
            sourceWidth,
            sourceHeight,
            dragPosition.x - cell.width / 2,
            dragPosition.y - cell.height / 2,
            cell.width,
            cell.height
        );

        ctx.restore();

        ctx.strokeStyle = "#F4C45E";
        ctx.lineWidth = Math.max(4, overlay.width / 250);

        ctx.strokeRect(
            dragPosition.x - cell.width / 2,
            dragPosition.y - cell.height / 2,
            cell.width,
            cell.height
        );
    }

    ctx.strokeStyle = "#F4C45E";
    ctx.lineWidth = Math.max(4, overlay.width / 250);
    ctx.setLineDash([]);

    ctx.strokeRect(
        frame.left,
        frame.top,
        frame.width,
        frame.height
    );
}

// ==========================================
// PINCH CURSOR
// ==========================================

function drawPinchCursor(position) {
    if (!position) return;

    ctx.beginPath();
    ctx.arc(
        position.x,
        position.y,
        Math.max(12, overlay.width / 90),
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "rgba(244,196,94,.25)";
    ctx.fill();

    ctx.strokeStyle = "#F4C45E";
    ctx.lineWidth = Math.max(3, overlay.width / 300);
    ctx.stroke();
}

// ==========================================
// PUZZLE SOLVED
// ==========================================

function checkPuzzleSolved() {
    const solved = puzzleTiles.every(
        (tile, index) => tile === index
    );

    if (!solved) return;

    puzzleSolved = true;

    draggedTileIndex = null;
    dragPosition = null;

    statusText.textContent = "PUZZLE SOLVED!";
    nextPhotoButton.classList.remove("hidden");

    nextPhotoButton.textContent =
        completedPhotos.length + 1 >= totalPhotos
            ? "View my photobox →"
            : "Next photo →";
}

function drawPuzzleSolved() {
    if (!lockedFrame) return;

    const centerX = lockedFrame.left + lockedFrame.width / 2;
    const centerY = lockedFrame.top + lockedFrame.height / 2;

    const boxWidth = lockedFrame.width * .72;
    const boxHeight = lockedFrame.height * .18;

    ctx.save();
    ctx.translate(overlay.width, 0);
    ctx.scale(-1, 1);

    const mirroredX = overlay.width - centerX;

    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(
        mirroredX - boxWidth / 2,
        centerY - boxHeight / 2,
        boxWidth,
        boxHeight
    );

    ctx.fillStyle = "#F4C45E";
    ctx.font = `bold ${Math.max(24, lockedFrame.width * .065)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PUZZLE SOLVED!", mirroredX, centerY);

    ctx.restore();
}

// ==========================================
// SAVE COMPLETED PHOTO
// ==========================================

function saveCompletedPhoto() {
    const savedCanvas = document.createElement("canvas");

    savedCanvas.width = capturedPhoto.width;
    savedCanvas.height = capturedPhoto.height;

    savedCanvas.getContext("2d").drawImage(capturedPhoto, 0, 0);

    completedPhotos.push(savedCanvas);

    updatePreviewPanel();
}

// ==========================================
// NEXT PHOTO
// ==========================================

function handleNextPhoto() {
    if (!puzzleSolved) return;

    saveCompletedPhoto();

    if (completedPhotos.length >= totalPhotos) {
        finishPhotoSession();
        return;
    }

    currentPhotoNumber++;
    updatePhotoProgress();

    resetPhotoState();

    nextPhotoButton.classList.add("hidden");

    statusText.textContent =
        "Position both hands to create a new frame.";
}

// ==========================================
// RESET PHOTO STATE
// ==========================================

function resetPhotoState() {
    photoTaken = false;

    countdownStartTime = null;
    lockedFrame = null;

    puzzleActive = false;
    puzzleSolved = false;
    puzzleTiles = [];

    draggedTileIndex = null;
    dragPosition = null;
    pinchWasActive = false;

    currentHands = [];
    lastVideoTime = -1;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
}

// ==========================================
// FINISH SESSION + PRINTER ANIMATION
// ==========================================

async function finishPhotoSession() {
    stopCamera();

    renderPhotobox();

    cameraPage.classList.remove("hidden");

    await playPrinterAnimation();

    cameraPage.classList.add("hidden");
    resultPage.classList.remove("hidden");

    mainNavbar.classList.remove("hidden");
    mainFooter.classList.remove("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

// ==========================================
// PRINTER ANIMATION
// ==========================================

function playPrinterAnimation() {
    return new Promise((resolve) => {
        const overlayElement = document.createElement("div");

        overlayElement.className = "printing-overlay";

        const imageURL = finalPhotoboxCanvas.toDataURL("image/png");

        overlayElement.innerHTML = `
            <div class="printing-content">
                <p class="printing-eyebrow">FRAME & FOUND</p>
                <h2>Your memories are printing.</h2>
                <p class="printing-description">
                    Just a moment, we're preparing your photobox.
                </p>

                <div class="printer-scene">
                    <div class="printer-paper">
                        <img src="${imageURL}" alt="Your photobox">
                    </div>

                    <div class="printer-machine">
                        <div class="printer-top">
                            <span class="printer-light"></span>
                            <span class="printer-brand">F&F</span>
                        </div>

                        <div class="printer-slot"></div>

                        <div class="printer-front">
                            <span class="printer-front-label">
                                FRAME & FOUND
                            </span>
                        </div>

                        <div class="printer-bottom"></div>
                    </div>
                </div>

                <div class="printing-progress"><span></span></div>
                <p class="printing-status">PRINTING YOUR PHOTO...</p>
            </div>
        `;

        cameraPage.appendChild(overlayElement);

        window.setTimeout(() => {
            overlayElement.classList.add("printing-finished");

            window.setTimeout(() => {
                overlayElement.remove();
                resolve();
            }, 500);
        }, 4200);
    });
}

// ==========================================
// RENDER FINAL PHOTOBOX
// ==========================================

function renderPhotobox() {
    finalPhotoboxCanvas = createPhotoboxCanvas();

    // Set editor canvas to the same original photobox dimensions.
    editorCanvas.width = finalPhotoboxCanvas.width;
    editorCanvas.height = finalPhotoboxCanvas.height;

    editorCanvas.className =
        `photobox-editor-canvas ${selectedLayout}`;

    stickers = [];
    selectedStickerId = null;
    stickerHistory = [];
    stickerIdCounter = 0;

    renderStickerGrid("all");
    updateStickerControls();
    drawEditorCanvas();
}

// ==========================================
// CREATE PHOTOBOX CANVAS
// ==========================================

function createPhotoboxCanvas() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const photoWidth = 600;
    const photoHeight = 800;

    const gap = 18;
    const padding = 30;

    const columns = selectedLayout === "horizontal"
        ? 3
        : selectedLayout === "four"
            ? 2
            : 1;

    const rows = selectedLayout === "horizontal"
        ? 1
        : selectedLayout === "four"
            ? 2
            : 3;

    canvas.width =
        padding * 2 +
        columns * photoWidth +
        (columns - 1) * gap;

    canvas.height =
        padding * 2 +
        rows * photoHeight +
        (rows - 1) * gap +
        55;

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#E7E4D9";

    context.fillRect(
        padding,
        padding,
        canvas.width - padding * 2,
        canvas.height - padding * 2 - 55
    );

    completedPhotos.forEach((photo, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);

        const x = padding + col * (photoWidth + gap);
        const y = padding + row * (photoHeight + gap);

        drawImageCover(context, photo, x, y, photoWidth, photoHeight);
    });

    context.fillStyle = "#26352F";
    context.font = "bold 22px Georgia";
    context.textAlign = "center";
    context.textBaseline = "middle";

    context.fillText(
        "FRAME & FOUND.",
        canvas.width / 2,
        canvas.height - 30
    );

    return canvas;
}

// ==========================================
// DRAW IMAGE COVER
// ==========================================

function drawImageCover(context, image, x, y, width, height) {
    const sourceWidth = image.width;
    const sourceHeight = image.height;

    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;

    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceRatio > targetRatio) {
        sw = sourceHeight * targetRatio;
        sx = (sourceWidth - sw) / 2;
    } else {
        sh = sourceWidth / targetRatio;
        sy = (sourceHeight - sh) / 2;
    }

    context.drawImage(
        image,
        sx,
        sy,
        sw,
        sh,
        x,
        y,
        width,
        height
    );
}

// ==========================================
// STICKER GRID
// ==========================================

function renderStickerGrid(category = "all") {
    stickerGrid.innerHTML = "";

    const filteredStickers = category === "all"
        ? builtInStickers
        : builtInStickers.filter(
            sticker => sticker.category === category
        );

    filteredStickers.forEach((sticker) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "sticker-option";
        button.textContent = sticker.emoji;
        button.title = sticker.name;
        button.setAttribute("aria-label", `Add ${sticker.name}`);

        button.addEventListener("click", () => {
            addSticker(sticker);
        });

        stickerGrid.appendChild(button);
    });
}

// ==========================================
// STICKER CATEGORY FILTER
// ==========================================

stickerCategories.addEventListener("click", (event) => {
    const button = event.target.closest(".sticker-category");

    if (!button) return;

    stickerCategories
        .querySelectorAll(".sticker-category")
        .forEach(item => item.classList.remove("active"));

    button.classList.add("active");

    renderStickerGrid(button.dataset.category);
});

// ==========================================
// STICKER HISTORY
// ==========================================

function saveStickerHistory() {
    stickerHistory.push({
        stickers: JSON.parse(JSON.stringify(stickers)),
        selectedStickerId,
    });

    if (stickerHistory.length > 50) {
        stickerHistory.shift();
    }

    updateStickerControls();
}

function undoStickerAction() {
    if (stickerHistory.length === 0) return;

    const previousState = stickerHistory.pop();

    stickers = previousState.stickers;
    selectedStickerId = previousState.selectedStickerId;

    drawEditorCanvas();
    updateStickerControls();
}

// ==========================================
// ADD STICKER
// ==========================================

function addSticker(stickerData) {
    if (!finalPhotoboxCanvas) return;

    saveStickerHistory();

    const offset = (stickers.length % 5) * 25;

    const newSticker = {
        id: ++stickerIdCounter,
        emoji: stickerData.emoji,
        name: stickerData.name,
        x: finalPhotoboxCanvas.width / 2 + offset,
        y: finalPhotoboxCanvas.height / 2 + offset,
        size: finalPhotoboxCanvas.width * .105,
        rotation: 0,
    };

    stickers.push(newSticker);
    selectedStickerId = newSticker.id;

    drawEditorCanvas();
    updateStickerControls();
}

// ==========================================
// GET SELECTED STICKER
// ==========================================

function getSelectedSticker() {
    return stickers.find(
        sticker => sticker.id === selectedStickerId
    ) || null;
}

// ==========================================
// DRAW STICKER
// ==========================================

function drawSticker(context, sticker) {
    context.save();

    context.translate(sticker.x, sticker.y);
    context.rotate(sticker.rotation);

    context.textAlign = "center";
    context.textBaseline = "middle";

    const fontSize = sticker.size;

    context.font =
        `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

    context.fillText(sticker.emoji, 0, 0);

    context.restore();
}

// ==========================================
// DRAW SELECTED STICKER BORDER
// ==========================================

function drawStickerSelection(context, sticker) {
    context.save();

    context.translate(sticker.x, sticker.y);
    context.rotate(sticker.rotation);

    const size = sticker.size;
    const half = size * .62;

    context.strokeStyle = "#D98C5F";
    context.lineWidth = Math.max(3, finalPhotoboxCanvas.width * .003);
    context.setLineDash([
        finalPhotoboxCanvas.width * .008,
        finalPhotoboxCanvas.width * .005,
    ]);

    context.strokeRect(-half, -half, half * 2, half * 2);

    context.setLineDash([]);

    // Corner markers
    const markerSize = size * .09;

    const corners = [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
    ];

    context.fillStyle = "#FFFFFF";
    context.strokeStyle = "#D98C5F";
    context.lineWidth = Math.max(2, finalPhotoboxCanvas.width * .002);

    corners.forEach(([x, y]) => {
        context.beginPath();
        context.arc(x, y, markerSize, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });

    context.restore();
}

// ==========================================
// DRAW EDITOR CANVAS
// ==========================================

function drawEditorCanvas() {
    if (!finalPhotoboxCanvas) return;

    editorCtx.clearRect(
        0,
        0,
        editorCanvas.width,
        editorCanvas.height
    );

    // Draw original photobox.
    editorCtx.drawImage(finalPhotoboxCanvas, 0, 0);

    // Draw all stickers.
    stickers.forEach(sticker => {
        drawSticker(editorCtx, sticker);
    });

    // Selection border is only visible in editor.
    const selected = getSelectedSticker();

    if (selected) {
        drawStickerSelection(editorCtx, selected);
    }
}

// ==========================================
// STICKER POSITION / HIT TEST
// ==========================================

function getCanvasPosition(event) {
    const rect = editorCanvas.getBoundingClientRect();

    return {
        x: (event.clientX - rect.left) *
            (editorCanvas.width / rect.width),

        y: (event.clientY - rect.top) *
            (editorCanvas.height / rect.height),
    };
}

function getStickerAtPosition(x, y) {
    // Reverse order: stickers added last are on top.
    for (let i = stickers.length - 1; i >= 0; i--) {
        const sticker = stickers[i];

        const dx = x - sticker.x;
        const dy = y - sticker.y;

        // Reverse rotation for hit detection.
        const cos = Math.cos(-sticker.rotation);
        const sin = Math.sin(-sticker.rotation);

        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

        const half = sticker.size * .62;

        if (
            localX >= -half &&
            localX <= half &&
            localY >= -half &&
            localY <= half
        ) {
            return sticker;
        }
    }

    return null;
}

// ==========================================
// CANVAS POINTER EVENTS
// ==========================================

editorCanvas.addEventListener("pointerdown", (event) => {
    if (!finalPhotoboxCanvas) return;

    const position = getCanvasPosition(event);
    const sticker = getStickerAtPosition(position.x, position.y);

    if (!sticker) {
        selectedStickerId = null;
        isDraggingSticker = false;

        drawEditorCanvas();
        updateStickerControls();
        return;
    }

    selectedStickerId = sticker.id;

    saveStickerHistory();

    isDraggingSticker = true;

    dragOffset = {
        x: position.x - sticker.x,
        y: position.y - sticker.y,
    };

    editorCanvas.setPointerCapture(event.pointerId);
    editorCanvas.classList.add("is-dragging");

    drawEditorCanvas();
    updateStickerControls();
});

editorCanvas.addEventListener("pointermove", (event) => {
    if (!isDraggingSticker) return;

    const sticker = getSelectedSticker();

    if (!sticker) return;

    const position = getCanvasPosition(event);

    sticker.x = position.x - dragOffset.x;
    sticker.y = position.y - dragOffset.y;

    drawEditorCanvas();
});

function stopStickerDragging() {
    isDraggingSticker = false;

    editorCanvas.classList.remove("is-dragging");

    drawEditorCanvas();
}

editorCanvas.addEventListener("pointerup", stopStickerDragging);
editorCanvas.addEventListener("pointercancel", stopStickerDragging);
editorCanvas.addEventListener("lostpointercapture", stopStickerDragging);

// ==========================================
// STICKER CONTROLS
// ==========================================

function updateStickerControls() {
    const selected = getSelectedSticker();
    const hasSelection = Boolean(selected);

    stickerSmallerButton.disabled = !hasSelection;
    stickerLargerButton.disabled = !hasSelection;
    stickerRotateButton.disabled = !hasSelection;
    stickerDeleteButton.disabled = !hasSelection;

    stickerUndoButton.disabled = stickerHistory.length === 0;

    stickerSelectionLabel.textContent = selected
        ? selected.name
        : "None";

    editorCanvas.classList.toggle("has-selection", hasSelection);
}

// ==========================================
// RESIZE STICKER
// ==========================================

function resizeSelectedSticker(multiplier) {
    const selected = getSelectedSticker();

    if (!selected) return;

    const newSize = selected.size * multiplier;

    if (newSize < finalPhotoboxCanvas.width * .035) return;
    if (newSize > finalPhotoboxCanvas.width * .25) return;

    saveStickerHistory();

    selected.size = newSize;

    drawEditorCanvas();
    updateStickerControls();
}

stickerSmallerButton.addEventListener("click", () => {
    resizeSelectedSticker(.85);
});

stickerLargerButton.addEventListener("click", () => {
    resizeSelectedSticker(1.18);
});

// ==========================================
// ROTATE STICKER
// ==========================================

stickerRotateButton.addEventListener("click", () => {
    const selected = getSelectedSticker();

    if (!selected) return;

    saveStickerHistory();

    selected.rotation += Math.PI / 12;

    drawEditorCanvas();
    updateStickerControls();
});

// ==========================================
// DELETE STICKER
// ==========================================

function deleteSelectedSticker() {
    if (selectedStickerId === null) return;

    saveStickerHistory();

    stickers = stickers.filter(
        sticker => sticker.id !== selectedStickerId
    );

    selectedStickerId = null;

    drawEditorCanvas();
    updateStickerControls();
}

stickerDeleteButton.addEventListener("click", deleteSelectedSticker);

// ==========================================
// UNDO
// ==========================================

stickerUndoButton.addEventListener("click", undoStickerAction);

// ==========================================
// RESET STICKERS
// ==========================================

stickerResetButton.addEventListener("click", () => {
    if (stickers.length === 0) return;

    const confirmed = window.confirm(
        "Hapus semua sticker dari photobooth?"
    );

    if (!confirmed) return;

    saveStickerHistory();

    stickers = [];
    selectedStickerId = null;

    drawEditorCanvas();
    updateStickerControls();
});

// ==========================================
// DOWNLOAD FINAL PHOTOBOX
// ==========================================

function createFinalDownloadCanvas() {
    const canvas = document.createElement("canvas");

    canvas.width = finalPhotoboxCanvas.width;
    canvas.height = finalPhotoboxCanvas.height;

    const context = canvas.getContext("2d");

    // Base photobox.
    context.drawImage(finalPhotoboxCanvas, 0, 0);

    // Draw stickers without selection borders.
    stickers.forEach(sticker => {
        drawSticker(context, sticker);
    });

    return canvas;
}

function downloadPhotobox() {
    if (!finalPhotoboxCanvas) return;

    const downloadCanvas = createFinalDownloadCanvas();

    const link = document.createElement("a");

    link.download = "frame-and-found.png";
    link.href = downloadCanvas.toDataURL("image/png");

    link.click();
}

// ==========================================
// MAIN CAMERA LOOP
// ==========================================

function predictLoop() {
    if (!cameraStream) return;

    animationId = requestAnimationFrame(predictLoop);

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const hands = detectHands();

    // PHOTO FRAME MODE
    if (!photoTaken && countdownStartTime === null) {
        const frame = getFrameRect(hands);

        if (frame) {
            drawFrameOverlay(frame);

            if (detectPhotoGesture(hands)) {
                startCountdown(frame);
            } else {
                statusText.textContent =
                    "Pinch your thumb and middle finger to capture.";
            }
        } else {
            statusText.textContent =
                "Position both hands to create a frame.";
        }
    }

    // COUNTDOWN MODE
    if (!photoTaken && countdownStartTime !== null) {
        drawFrameOverlay(lockedFrame);
        handleCountdown(performance.now());
        drawHands(hands);
    }

    // PUZZLE MODE
    if (puzzleActive) {
        drawFrameOverlay(lockedFrame);

        handlePuzzleMovement(hands);
        drawPuzzle();

        if (puzzleSolved) {
            drawPuzzleSolved();
        }

        drawHands(hands);

        const pinch = getPuzzlePinchInfo(hands);

        if (pinch.active) {
            drawPinchCursor({
                x: pinch.x,
                y: pinch.y,
            });
        }

        if (!puzzleSolved) {
            statusText.textContent =
                draggedTileIndex !== null
                    ? "Release your fingers to place the puzzle piece."
                    : "Pinch a puzzle piece using your thumb and index finger.";
        } else {
            statusText.textContent =
                "PUZZLE SOLVED! Continue to the next photo.";
        }
    }
}

// ==========================================
// START CAMERA
// ==========================================

async function startCamera() {
    try {
        if (cameraStream) stopCamera();

        resetPhotoState();

        await initializeHandLandmarker();
        await initializeCamera();

        predictLoop();
    } catch (error) {
        console.error("Camera error:", error);

        statusText.textContent =
            "Cannot open camera. Check camera permission and connection.";
    }
}

// ==========================================
// STOP CAMERA
// ==========================================

function stopCamera() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    video.srcObject = null;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    countdownStartTime = null;
    lockedFrame = null;

    currentHands = [];
    lastVideoTime = -1;

    photoTaken = false;

    puzzleActive = false;
    puzzleSolved = false;

    draggedTileIndex = null;
    dragPosition = null;
    pinchWasActive = false;
}

// ==========================================
// RESTART CAMERA
// ==========================================

async function restartCamera() {
    stopCamera();
    resetPhotoState();

    nextPhotoButton.classList.add("hidden");

    await startCamera();
}

// ==========================================
// EXIT CAMERA
// ==========================================

function exitCameraPage() {
    stopCamera();

    if (previewPanel) {
        previewPanel.remove();
        previewPanel = null;
    }

    cameraPage.classList.add("hidden");

    homePage.classList.remove("hidden");
    mainNavbar.classList.remove("hidden");
    mainFooter.classList.remove("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

// ==========================================
// NEW SESSION
// ==========================================

function createNewSession() {
    completedPhotos = [];

    currentPhotoNumber = 1;
    totalPhotos = 0;

    selectedLayout = null;
    finalPhotoboxCanvas = null;

    stickers = [];
    selectedStickerId = null;
    stickerHistory = [];

    if (previewPanel) {
        previewPanel.remove();
        previewPanel = null;
    }

    resultPage.classList.add("hidden");
    homePage.classList.remove("hidden");

    layoutCards.forEach(card => {
        card.classList.remove("selected");
    });

    startButton.disabled = true;

    layoutHint.textContent =
        "Select a photo layout to continue.";

    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

// ==========================================
// BUTTON EVENTS
// ==========================================

startButton.addEventListener("click", startPhotoSession);

restartButton.addEventListener("click", restartCamera);

stopButton.addEventListener("click", () => {
    stopCamera();
    statusText.textContent = "Camera stopped.";
});

exitCameraButton.addEventListener("click", exitCameraPage);

nextPhotoButton.addEventListener("click", handleNextPhoto);

downloadButton.addEventListener("click", downloadPhotobox);

newSessionButton.addEventListener("click", createNewSession);