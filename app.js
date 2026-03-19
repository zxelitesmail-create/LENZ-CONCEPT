// ═══════════════════════════════════════════════════════════
//  LENS — app.js
//  Firebase 10 (modular SDK via CDN)
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  increment,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ───────────────────────────────────────────────────────────
//  CONFIGURATION  ← Replace with your Firebase project config
// ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAtGUSS7fySXtb8kGN-l1cF93_AYNwAV8Y",
  authDomain:        "lens-feed-dc4ed.firebaseapp.com",
  projectId:         "lens-feed-dc4ed",
  storageBucket:     "lens-feed-dc4ed.firebasestorage.app",
  messagingSenderId: "641813910403",
  appId:             "1:641813910403:web:0a707229e41b856de0dcb6"
};

const ADMIN_EMAIL = "canesugar251@gmail.com";
const PAGE_SIZE   = 15;
const INSTAGRAM_REGEX = /instagram\.com\/p\/([A-Za-z0-9_-]+)/;

// ───────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ───────────────────────────────────────────────────────────
//  STATE
// ───────────────────────────────────────────────────────────
let currentUser       = null;
let isAdmin           = false;
let lastVisibleDoc    = null;
let hasMore           = false;
let feedUnsubscribe   = null;
let commentUnsubs     = {};
let openImageId       = null;
let currentUrlType    = "instagram"; // "instagram" or "direct"

// ───────────────────────────────────────────────────────────
//  DOM REFS
// ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const skeletonGrid      = $("skeleton-grid");
const imageGrid         = $("image-grid");
const emptyState        = $("empty-state");
const loadMoreContainer = $("load-more-container");
const loadMoreBtn       = $("load-more-btn");

const adminLoginBtn     = $("admin-login-btn");
const adminLogoutBtn    = $("admin-logout-btn");
const adminBadge        = $("admin-badge");
const adminPanel        = $("admin-panel");

const imgUrlInput       = $("img-url-input");
const imgCaptionInput   = $("img-caption-input");
const captionCount      = $("caption-count");
const postImageBtn      = $("post-image-btn");
const urlError          = $("url-error");

const authModal         = $("auth-modal");
const authEmail         = $("auth-email");
const authPassword      = $("auth-password");
const authError         = $("auth-error");
const authSubmitBtn     = $("auth-submit-btn");
const authModalClose    = $("auth-modal-close");

const imageModal        = $("image-modal");
const imageModalClose   = $("image-modal-close");
const modalImg          = $("modal-img");
const modalCaption      = $("modal-caption");
const modalTime         = $("modal-time");
const modalLikeBtn      = $("modal-like-btn");
const modalLikeCount    = $("modal-like-count");
const modalCommentsList = $("modal-comments-list");
const modalCommentName  = $("modal-comment-name");
const modalCommentText  = $("modal-comment-text");
const modalNameError    = $("modal-name-error");
const modalTextError    = $("modal-text-error");
const modalCommentSubmit= $("modal-comment-submit");

const confirmModal      = $("confirm-modal");
const confirmTitle      = $("confirm-title");
const confirmMessage    = $("confirm-message");
const confirmCancelBtn  = $("confirm-cancel-btn");
const confirmOkBtn      = $("confirm-ok-btn");

const cardTemplate      = $("card-template");

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════

function timeAgo(ts) {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (seconds < 60)  return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function isValidImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url.trim());
}

function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setLoading(btn, loading) {
  const text   = btn.querySelector(".btn-text");
  const loader = btn.querySelector(".btn-loader");
  btn.disabled = loading;
  if (text)   text.classList.toggle("hidden", loading);
  if (loader) loader.classList.toggle("hidden", !loading);
}

// ─── Toast ───
function showToast(message, type = "info") {
  const container = $("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span><span>${sanitize(message)}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove());
  }, 3200);
}

// ─── Confirm dialog ───
function showConfirm(title, message) {
  return new Promise(resolve => {
    confirmTitle.textContent   = title;
    confirmMessage.textContent = message;
    confirmModal.classList.remove("hidden");

    const ok = () => { cleanup(); resolve(true); };
    const cancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      confirmOkBtn.removeEventListener("click", ok);
      confirmCancelBtn.removeEventListener("click", cancel);
      confirmModal.classList.add("hidden");
    };

    confirmOkBtn.addEventListener("click", ok);
    confirmCancelBtn.addEventListener("click", cancel);
  });
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

onAuthStateChanged(auth, user => {
  currentUser = user;
  isAdmin     = !!(user && user.email === ADMIN_EMAIL);
  updateAdminUI();
});

function updateAdminUI() {
  adminLoginBtn.classList.toggle("hidden", isAdmin);
  adminLogoutBtn.classList.toggle("hidden", !isAdmin);
  adminBadge.classList.toggle("hidden", !isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);

  // Show/hide all admin-only elements
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });
}

adminLoginBtn.addEventListener("click", () => {
  authEmail.value    = "";
  authPassword.value = "";
  authError.textContent = "";
  authModal.classList.remove("hidden");
  authEmail.focus();
});

authModalClose.addEventListener("click", () => authModal.classList.add("hidden"));
authModal.addEventListener("click", e => {
  if (e.target === authModal) authModal.classList.add("hidden");
});

authPassword.addEventListener("keydown", e => {
  if (e.key === "Enter") authSubmitBtn.click();
});

authSubmitBtn.addEventListener("click", async () => {
  const email    = authEmail.value.trim();
  const password = authPassword.value;
  authError.textContent = "";

  if (!email || !password) {
    authError.textContent = "Email and password are required.";
    return;
  }

  setLoading(authSubmitBtn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authModal.classList.add("hidden");
    showToast("Welcome back, Admin.", "success");
  } catch (err) {
    authError.textContent = friendlyAuthError(err.code);
  } finally {
    setLoading(authSubmitBtn, false);
  }
});

adminLogoutBtn.addEventListener("click", async () => {
  // Cleanup listeners
  if (feedUnsubscribe) { feedUnsubscribe(); feedUnsubscribe = null; }
  Object.values(commentUnsubs).forEach(u => u());
  commentUnsubs = {};

  await signOut(auth);
  showToast("Logged out.", "info");
  // Restart feed in public mode
  initFeed();
});

function friendlyAuthError(code) {
  const map = {
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/invalid-email":        "Please enter a valid email.",
    "auth/too-many-requests":    "Too many attempts. Try again later.",
    "auth/invalid-credential":   "Invalid email or password.",
  };
  return map[code] || "Sign-in failed. Please try again.";
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — URL TYPE TABS
// ═══════════════════════════════════════════════════════════

document.querySelectorAll(".url-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".url-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentUrlType = tab.dataset.type;
    imgUrlInput.value = "";
    urlError.textContent = "";
    imgUrlInput.classList.remove("error");

    if (currentUrlType === "instagram") {
      document.getElementById("url-label").textContent = "Instagram Post URL";
      imgUrlInput.placeholder = "https://www.instagram.com/p/ABC123/";
      document.getElementById("url-hint").textContent = "Paste any public Instagram post link";
    } else {
      document.getElementById("url-label").textContent = "Direct Image URL";
      imgUrlInput.placeholder = "https://example.com/photo.jpg";
      document.getElementById("url-hint").textContent = "URL must end in .jpg .jpeg .png .gif .webp";
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — POST IMAGE
// ═══════════════════════════════════════════════════════════

imgCaptionInput.addEventListener("input", () => {
  captionCount.textContent = `${imgCaptionInput.value.length} / 150`;
});

postImageBtn.addEventListener("click", async () => {
  const url     = imgUrlInput.value.trim();
  const caption = imgCaptionInput.value.trim().slice(0, 150);
  urlError.textContent = "";
  imgUrlInput.classList.remove("error");

  if (!url) {
    urlError.textContent = "Please enter a URL.";
    imgUrlInput.classList.add("error");
    return;
  }

  let postType = currentUrlType;
  let finalUrl = url;

  if (currentUrlType === "instagram") {
    const match = url.match(INSTAGRAM_REGEX);
    if (!match) {
      urlError.textContent = "Please enter a valid Instagram post URL (instagram.com/p/...)";
      imgUrlInput.classList.add("error");
      return;
    }
    // Normalize to clean URL
    finalUrl = `https://www.instagram.com/p/${match[1]}/`;
    postType = "instagram";
  } else {
    if (!isValidImageUrl(url)) {
      urlError.textContent = "URL must end in .jpg, .jpeg, .png, .gif, or .webp";
      imgUrlInput.classList.add("error");
      return;
    }
    postType = "image";
  }

  setLoading(postImageBtn, true);

  try {
    await addDoc(collection(db, "images"), {
      url: finalUrl,
      type: postType,
      caption,
      likes: 0,
      createdAt: serverTimestamp()
    });
    imgUrlInput.value     = "";
    imgCaptionInput.value = "";
    captionCount.textContent = "0 / 150";
    showToast("Post published!", "success");
    postImageBtn.classList.add("action-flash");
    setTimeout(() => postImageBtn.classList.remove("action-flash"), 600);
  } catch (err) {
    showToast("Failed to publish. Check console.", "error");
    console.error(err);
  } finally {
    setLoading(postImageBtn, false);
  }
});

imgUrlInput.addEventListener("input", () => imgUrlInput.classList.remove("error"));

// ═══════════════════════════════════════════════════════════
//  FEED — INIT & onSnapshot
// ═══════════════════════════════════════════════════════════

function initFeed() {
  if (feedUnsubscribe) feedUnsubscribe();
  imageGrid.innerHTML = "";
  lastVisibleDoc      = null;
  hasMore             = false;

  skeletonGrid.classList.remove("hidden");
  imageGrid.classList.add("hidden");
  emptyState.classList.add("hidden");
  loadMoreContainer.classList.add("hidden");

  const q = query(
    collection(db, "images"),
    orderBy("createdAt", "desc"),
    limit(PAGE_SIZE)
  );

  feedUnsubscribe = onSnapshot(q, snapshot => {
    skeletonGrid.classList.add("hidden");
    imageGrid.classList.remove("hidden");

    // Diff-based update
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const card = buildCard(change.doc);
        // Insert in order
        const after = imageGrid.querySelector(`[data-id="${change.doc.id}"]`);
        if (!after) imageGrid.prepend(card);
      }
      if (change.type === "modified") {
        updateCard(change.doc);
      }
      if (change.type === "removed") {
        const el = imageGrid.querySelector(`[data-id="${change.doc.id}"]`);
        if (el) el.remove();
      }
    });

    // Track pagination cursor
    const docs = snapshot.docs;
    if (docs.length === PAGE_SIZE) {
      lastVisibleDoc = docs[docs.length - 1];
      hasMore        = true;
      loadMoreContainer.classList.remove("hidden");
    } else {
      hasMore = false;
      loadMoreContainer.classList.add("hidden");
    }

    // Empty state
    emptyState.classList.toggle("hidden", imageGrid.children.length > 0);
  }, err => {
    console.error("Feed error:", err);
    showToast("Failed to load feed.", "error");
    skeletonGrid.classList.add("hidden");
  });
}

// ─── Load More ───
loadMoreBtn.addEventListener("click", async () => {
  if (!lastVisibleDoc || !hasMore) return;
  setLoading(loadMoreBtn, true);

  try {
    const q = query(
      collection(db, "images"),
      orderBy("createdAt", "desc"),
      startAfter(lastVisibleDoc),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      if (!imageGrid.querySelector(`[data-id="${docSnap.id}"]`)) {
        imageGrid.appendChild(buildCard(docSnap));
      }
    });

    if (snap.docs.length === PAGE_SIZE) {
      lastVisibleDoc = snap.docs[snap.docs.length - 1];
    } else {
      hasMore = false;
      loadMoreContainer.classList.add("hidden");
    }
  } catch (err) {
    showToast("Failed to load more.", "error");
    console.error(err);
  } finally {
    setLoading(loadMoreBtn, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  CARD — BUILD & UPDATE
// ═══════════════════════════════════════════════════════════

function buildCard(docSnap) {
  const data = docSnap.data();
  const id   = docSnap.id;
  const isInstagram = data.type === "instagram";

  const clone  = cardTemplate.content.cloneNode(true);
  const card   = clone.querySelector(".card");
  card.dataset.id   = id;
  card.dataset.type = data.type || "image";
  card.style.animationDelay = `${Math.random() * 0.12}s`;

  const img            = card.querySelector(".card-img");
  const embedWrap      = card.querySelector(".card-instagram-embed");
  const caption        = card.querySelector(".card-caption");
  const likeBtn        = card.querySelector(".card-like-btn");
  const likeCount      = card.querySelector(".like-count");
  const timeEl         = card.querySelector(".card-time");
  const deleteBtn      = card.querySelector(".card-delete-btn");
  const commentToggle  = card.querySelector(".comment-toggle-btn");
  const commentCount   = card.querySelector(".comment-count");
  const commentsSect   = card.querySelector(".comments-section");
  const submitBtn      = card.querySelector(".comment-submit-btn");
  const nameInput      = card.querySelector(".comment-name-input");
  const textInput      = card.querySelector(".comment-text-input");
  const errEl          = card.querySelector(".comment-error");
  const imgWrap        = card.querySelector(".card-img-wrap");

  caption.textContent       = data.caption || "";
  likeCount.textContent     = data.likes || 0;
  timeEl.textContent        = timeAgo(data.createdAt);

  if (isInstagram) {
    // Hide plain img, show embed container
    img.classList.add("hidden");
    embedWrap.classList.remove("hidden");
    embedWrap.innerHTML = buildInstagramEmbed(data.url);
    // Trigger Instagram embed script
    if (window.instgrm) window.instgrm.Embeds.process();
  } else {
    img.src = data.url;
    img.alt = data.caption || "Post image";
  }

  // Like state
  const likedKey = `liked_${id}`;
  if (localStorage.getItem(likedKey)) {
    likeBtn.classList.add("liked", "locked");
  }

  // Admin controls
  if (isAdmin) deleteBtn.classList.remove("hidden");

  // Open modal on image click (only for direct images)
  if (!isInstagram) {
    imgWrap.addEventListener("click", e => {
      if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
      openImageModal(id, data);
    });
  }

  // Like
  likeBtn.addEventListener("click", () => handleLike(id, likeBtn, likeCount));

  // Delete post
  deleteBtn.addEventListener("click", async () => {
    const ok = await showConfirm("Delete this post?", "This will permanently remove the post and all its comments.");
    if (!ok) return;
    try {
      await cascadeDeleteImage(id);
      showToast("Post deleted.", "info");
    } catch (err) {
      showToast("Failed to delete post.", "error");
      console.error(err);
    }
  });

  // Comment toggle
  commentToggle.addEventListener("click", () => {
    const isExpanded = commentsSect.classList.contains("expanded");
    commentsSect.classList.toggle("expanded", !isExpanded);
    if (!isExpanded && !commentUnsubs[id]) {
      subscribeToComments(id, card.querySelector(".comments-list"), commentCount, null);
    }
  });

  // Submit comment
  submitBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    errEl.textContent = "";
    const err = validateComment(name, text);
    if (err) { errEl.textContent = err; return; }
    submitBtn.disabled = true;
    try {
      await addComment(id, name, text);
      nameInput.value = "";
      textInput.value = "";
      showToast("Comment posted!", "success");
    } catch (e) {
      errEl.textContent = "Failed to post comment.";
      console.error(e);
    } finally {
      submitBtn.disabled = false;
    }
  });

  return card;
}

function buildInstagramEmbed(url) {
  // Clean URL — remove query params for embed
  const cleanUrl = url.split("?")[0];
  return `<blockquote class="instagram-media"
    data-instgrm-permalink="${cleanUrl}"
    data-instgrm-version="14"
    style="width:100%;margin:0;border:none;border-radius:0;">
  </blockquote>`;
}

function updateCard(docSnap) {
  const data = docSnap.data();
  const card = imageGrid.querySelector(`[data-id="${docSnap.id}"]`);
  if (!card) return;

  const likeCount = card.querySelector(".like-count");
  const timeEl    = card.querySelector(".card-time");
  if (likeCount) likeCount.textContent = data.likes || 0;
  if (timeEl)    timeEl.textContent    = timeAgo(data.createdAt);
}

// ═══════════════════════════════════════════════════════════
//  LIKE SYSTEM
// ═══════════════════════════════════════════════════════════

async function handleLike(imageId, btn, countEl) {
  const key = `liked_${imageId}`;
  if (localStorage.getItem(key)) return;

  btn.classList.add("liked", "locked");
  localStorage.setItem(key, "1");

  try {
    await updateDoc(doc(db, "images", imageId), { likes: increment(1) });
    const n = parseInt(countEl.textContent || "0", 10);
    countEl.textContent = n + 1;
  } catch (err) {
    btn.classList.remove("liked", "locked");
    localStorage.removeItem(key);
    showToast("Failed to like post.", "error");
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════
//  COMMENTS
// ═══════════════════════════════════════════════════════════

function validateComment(name, text) {
  if (!name || name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 30)         return "Name is too long (max 30 chars).";
  if (!text || text.length < 5) return "Comment must be at least 5 characters.";
  if (text.length > 200)        return "Comment is too long (max 200 chars).";
  return null;
}

async function addComment(imageId, name, text) {
  await addDoc(collection(db, "comments"), {
    imageId,
    name: name.slice(0, 30),
    text: text.slice(0, 200),
    createdAt: serverTimestamp()
  });
}

function subscribeToComments(imageId, listEl, countEl, altListEl) {
  if (commentUnsubs[imageId]) return;

  const q = query(
    collection(db, "comments"),
    where("imageId", "==", imageId),
    orderBy("createdAt", "asc")
  );

  commentUnsubs[imageId] = onSnapshot(q, snap => {
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCommentsList(listEl, comments, imageId);
    if (altListEl) renderCommentsList(altListEl, comments, imageId);
    if (countEl) countEl.textContent = comments.length;
  }, err => {
    console.error("Comments error:", err);
  });
}

function renderCommentsList(listEl, comments, imageId) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (comments.length === 0) {
    const p = document.createElement("p");
    p.className = "no-comments";
    p.textContent = "No comments yet.";
    listEl.appendChild(p);
    return;
  }

  comments.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item";
    item.innerHTML = `
      <span class="comment-name">${sanitize(c.name)}</span>
      <span class="comment-text">${sanitize(c.text)}</span>
      <div class="comment-time">${timeAgo(c.createdAt)}</div>
      ${isAdmin ? `<button class="comment-delete-btn admin-only" data-cid="${c.id}">Delete</button>` : ""}
    `;

    if (isAdmin) {
      item.querySelector(".comment-delete-btn").addEventListener("click", async () => {
        const ok = await showConfirm("Delete comment?", "This comment will be permanently removed.");
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "comments", c.id));
          showToast("Comment removed.", "info");
        } catch (err) {
          showToast("Failed to delete comment.", "error");
          console.error(err);
        }
      });
    }

    listEl.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════
//  DELETE IMAGE (cascade)
// ═══════════════════════════════════════════════════════════

async function cascadeDeleteImage(imageId) {
  // Delete all comments for this image
  const commentsSnap = await getDocs(
    query(collection(db, "comments"), where("imageId", "==", imageId))
  );
  const deletions = commentsSnap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletions);
  // Delete image doc
  await deleteDoc(doc(db, "images", imageId));
  // Cleanup comment listener
  if (commentUnsubs[imageId]) {
    commentUnsubs[imageId]();
    delete commentUnsubs[imageId];
  }
  // Close modal if open
  if (openImageId === imageId) closeImageModal();
}

// ═══════════════════════════════════════════════════════════
//  IMAGE MODAL
// ═══════════════════════════════════════════════════════════

async function openImageModal(imageId, data) {
  openImageId = imageId;

  modalImg.src              = data.url;
  modalImg.alt              = data.caption || "Post image";
  modalCaption.textContent  = data.caption || "";
  modalTime.textContent     = timeAgo(data.createdAt);
  modalCommentName.value    = "";
  modalCommentText.value    = "";
  modalNameError.textContent= "";
  modalTextError.textContent= "";

  // Like state
  const key = `liked_${imageId}`;
  modalLikeCount.textContent = data.likes || 0;
  if (localStorage.getItem(key)) {
    modalLikeBtn.classList.add("liked", "locked");
  } else {
    modalLikeBtn.classList.remove("liked", "locked");
  }

  // Subscribe comments
  subscribeToComments(imageId, modalCommentsList, null, null);

  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  document.body.style.overflow = "";
  openImageId = null;
  modalImg.src = "";
}

imageModalClose.addEventListener("click", closeImageModal);
imageModal.addEventListener("click", e => {
  if (e.target === imageModal) closeImageModal();
});

// Modal like button
modalLikeBtn.addEventListener("click", () => {
  if (!openImageId) return;
  handleLike(openImageId, modalLikeBtn, modalLikeCount);
});

// Modal comment submit
modalCommentSubmit.addEventListener("click", async () => {
  const name = modalCommentName.value.trim();
  const text = modalCommentText.value.trim();
  modalNameError.textContent = "";
  modalTextError.textContent = "";

  if (!name || name.length < 2) {
    modalNameError.textContent = "Name must be at least 2 characters.";
    return;
  }
  if (name.length > 30) {
    modalNameError.textContent = "Name too long (max 30 chars).";
    return;
  }
  if (!text || text.length < 5) {
    modalTextError.textContent = "Comment must be at least 5 characters.";
    return;
  }
  if (text.length > 200) {
    modalTextError.textContent = "Comment too long (max 200 chars).";
    return;
  }

  setLoading(modalCommentSubmit, true);
  try {
    await addComment(openImageId, name, text);
    modalCommentName.value = "";
    modalCommentText.value = "";
    showToast("Comment posted!", "success");
  } catch (err) {
    modalTextError.textContent = "Failed to post comment.";
    console.error(err);
  } finally {
    setLoading(modalCommentSubmit, false);
  }
});

// ═══════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!imageModal.classList.contains("hidden"))   closeImageModal();
    if (!authModal.classList.contains("hidden"))    authModal.classList.add("hidden");
    if (!confirmModal.classList.contains("hidden")) confirmModal.classList.add("hidden");
  }
});

// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════

initFeed();
