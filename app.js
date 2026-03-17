'use strict';

var usernamePage = document.querySelector('#username-page');
var chatPage = document.querySelector('#chat-page');
var usernameForm = document.querySelector('#usernameForm');
var messageForm = document.querySelector('#messageForm');
var messageInput = document.querySelector('#message');
var messageArea = document.querySelector('#messageArea');
var serverUrlInput = document.querySelector('#serverUrl');
var displayUsername = document.querySelector('#display-username');

// Mobile and Members Sidebar Elements
var membersListContainer = document.querySelector('#members-list-container');
var onlineCount = document.querySelector('#online-count');
var hamburgerMenu = document.querySelector('#hamburger-menu');
var membersToggle = document.querySelector('#members-toggle');
var themeToggle = document.querySelector('#theme-toggle');
var mobileOverlay = document.querySelector('#mobile-overlay');

// Global state variables
var originalTitle = document.title;
var unreadMessagesCount = 0;
var isWindowFocused = true;
var titleBlinkInterval = null;

// Notification Sound (using a common windows-like blip or modern pop via data URI)
var notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// Track if window is focused
window.addEventListener('focus', function () {
    isWindowFocused = true;
    unreadMessagesCount = 0;
    if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
    }
    document.title = originalTitle;
});
window.addEventListener('blur', function () {
    isWindowFocused = false;
});

// Theme Toggle Logic
var isDarkMode = false;
var loginThemeToggle = document.querySelector('#login-theme-toggle');

function toggleTheme() {
    isDarkMode = !isDarkMode;
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
        if (loginThemeToggle) loginThemeToggle.textContent = '☀️';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        if (loginThemeToggle) loginThemeToggle.textContent = '🌙';
    }
}

themeToggle.addEventListener('click', toggleTheme);
if (loginThemeToggle) {
    loginThemeToggle.addEventListener('click', toggleTheme);
}

// Mobile UI Listeners
hamburgerMenu.addEventListener('click', function () {
    document.body.classList.toggle('sidebar-open');
    if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('members-open');
        mobileOverlay.classList.remove('hidden');
    } else {
        mobileOverlay.classList.add('hidden');
    }
});
membersToggle.addEventListener('click', function () {
    document.body.classList.toggle('members-open');
    if (document.body.classList.contains('members-open')) {
        document.body.classList.remove('sidebar-open');
        mobileOverlay.classList.remove('hidden');
    } else {
        mobileOverlay.classList.add('hidden');
    }
});
mobileOverlay.addEventListener('click', function () {
    document.body.classList.remove('sidebar-open', 'members-open');
    mobileOverlay.classList.add('hidden');
});

// Channel elements
var channelsListContainer = document.querySelector('#channels-list-container');
var addChannelBtn = document.querySelector('#add-channel-btn');
var currentChannelTitle = document.querySelector('#current-channel-title');
var welcomeTitle = document.querySelector('#welcome-title');
var welcomeDesc = document.querySelector('#welcome-desc');

var stompClient = null;
var currentSubscription = null;
var username = null;
var userRole = 'USER';
var userColor = '';
var currentChannel = 'general';
var knownChannels = ['general'];
var authMode = 'login'; // 'login' or 'register'
var voiceBtn = document.querySelector('#voice-btn');
var mediaRecorder = null;
var isRecording = false;
var typingTimeout = null;
var typingUsers = {};
var typingIndicator = document.querySelector('#typing-indicator');
var emojiBtn = document.querySelector('#emoji-btn');
var emojiPanel = document.querySelector('#emoji-picker-panel');
var searchBtn = document.querySelector('#search-btn');
var searchInput = document.querySelector('#search-input');
var contextMenu = document.querySelector('#msg-context-menu');
var ctxEdit = document.querySelector('#ctx-edit');
var ctxDelete = document.querySelector('#ctx-delete');
var selectedMessageId = null;
var selectedMessageElement = null;

var colors = [
    '#5865F2', '#EB459E', '#ED4245', '#FEE75C',
    '#57F287', '#F47B67', '#00BCD4', '#9B59B6'
];

function connect(event) {
    event.preventDefault(); // Always prevent form submission first!

    username = document.querySelector('#name').value.trim();
    var password = document.querySelector('#authPassword').value;
    var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
    var authError = document.querySelector('#auth-error');
    authError.style.display = 'none';

    if (!username) {
        authError.textContent = 'Username is required!';
        authError.style.display = 'block';
        return;
    }

    function proceedToChat(role) {
        userRole = role || 'USER';
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');
        displayUsername.textContent = username;
        userColor = getAvatarColor(username);
        document.querySelector('.user-profile .avatar').style.backgroundColor = userColor;
        // Store serverUrl globally for later use
        window._serverUrl = serverUrl;

        // Show/hide admin panel based on role
        if (adminPanelToggle) {
            if (userRole === 'ADMIN') {
                adminPanelToggle.classList.remove('hidden');
            } else {
                adminPanelToggle.classList.add('hidden');
            }
        }

        var socket = new SockJS(serverUrl + '/ws');
        stompClient = Stomp.over(socket);
        var headers = { 'ngrok-skip-browser-warning': 'true' };
        stompClient.connect(headers, onConnected, onError);
    }

    // If password is provided, try auth endpoints first
    if (password) {
        var endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        fetch(serverUrl + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ username: username, password: password })
        })
            .then(function (r) {
                if (!r.ok && r.status === 404) {
                    // Auth endpoint doesn't exist on this backend - fall back to direct connect
                    console.warn('Auth endpoint not found, connecting without auth...');
                    proceedToChat('USER');
                    return null;
                }
                return r.json();
            })
            .then(function (data) {
                if (!data) return; // Already handled (404 fallback)
                if (data.error) {
                    authError.textContent = data.error;
                    authError.style.display = 'block';
                    return;
                }
                proceedToChat(data.role);
            })
            .catch(function (err) {
                // Network error or non-JSON response - fall back to direct connect
                console.warn('Auth failed, connecting directly:', err);
                proceedToChat('USER');
            });
    } else {
        // No password - check if username is registered (requires password)
        fetch(serverUrl + '/api/auth/role?username=' + encodeURIComponent(username), {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                // If we get a response, the endpoint exists — check if user is registered
                // We need a dedicated check endpoint. For now, use /api/auth/check
                return fetch(serverUrl + '/api/auth/check?username=' + encodeURIComponent(username), {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                }).then(function (r2) { return r2.json(); });
            })
            .then(function (checkData) {
                if (checkData.exists === 'true' || checkData.exists === true) {
                    authError.textContent = 'This username is registered. Please enter the password!';
                    authError.style.display = 'block';
                } else {
                    proceedToChat('USER');
                }
            })
            .catch(function () {
                // Auth endpoint doesn't exist - connect directly
                proceedToChat('USER');
            });
    }
}

function onConnected() {
    var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
    var headers = { 'ngrok-skip-browser-warning': 'true' };

    // Subscribe to public channel for global events
    stompClient.subscribe('/topic/public', onMessageReceived);

    // Fetch existing channels
    fetch(serverUrl + '/api/channels', { headers: headers })
        .then(response => response.json())
        .then(channels => {
            channels.forEach(chan => {
                if (chan && !knownChannels.includes(chan) && chan !== 'public') {
                    knownChannels.push(chan);
                    appendChannelToUI(chan);
                }
            });
        })
        .catch(error => console.error('Error fetching channels:', error));

    subscribeToChannel(currentChannel);
}

function subscribeToChannel(channel) {
    if (currentSubscription) {
        // Send a LEAVE event directly to the channel topic (not via sendMessage to avoid saving to DB)
        stompClient.send("/app/chat.leave", {}, JSON.stringify({ sender: username, type: 'LEAVE', channel: currentChannel }));
        currentSubscription.unsubscribe();
    }

    currentChannel = channel;
    updateUIForChannel(channel);

    // Clear message area and show welcome message for new channel
    messageArea.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">#</div>
            <h1 id="welcome-title">Welcome to #${channel}!</h1>
            <p id="welcome-desc">This is the start of the #${channel} channel.</p>
        </div>
    `;

    // Subscribe to the new Channel Topic
    currentSubscription = stompClient.subscribe('/topic/' + channel, onMessageReceived);

    // Fetch history from database
    var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
    fetch(serverUrl + '/api/messages/' + channel, {
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    })
        .then(response => response.json())
        .then(messages => {
            messages.forEach(msg => {
                // Re-use our rendering logic but pass it artificially as a payload
                onMessageReceived({ body: JSON.stringify(msg) });
            });
        })
        .catch(error => console.error('Error fetching history:', error));

    // Tell server you joined this channel (Optional now, but we'll keep it)
    stompClient.send("/app/chat.addUser",
        {},
        JSON.stringify({ sender: username, type: 'JOIN', channel: channel })
    );
}

// Called from HTML onclick
window.switchChannel = function (channel) {
    if (channel !== currentChannel) {
        subscribeToChannel(channel);
    }
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
        mobileOverlay.classList.add('hidden');
    }
};

function appendChannelToUI(newChannel) {
    var div = document.createElement('div');
    div.className = 'channel';
    div.innerHTML = '<span class="hash">#</span> ' + newChannel;
    div.onclick = function () { switchChannel(newChannel); };
    channelsListContainer.appendChild(div);
}

addChannelBtn.addEventListener('click', function () {
    var newChannel = prompt("Enter new channel name:");
    if (newChannel && newChannel.trim().length > 0) {
        newChannel = newChannel.trim().toLowerCase().replace(/\s+/g, '-');

        if (!knownChannels.includes(newChannel)) {
            // Tell backend to broadcast new channel globally
            stompClient.send("/app/chat.createChannel", {}, JSON.stringify({ sender: username, channel: newChannel, type: 'CHANNEL_CREATE' }));
        }

        switchChannel(newChannel);
    }
});

function updateUIForChannel(channel) {
    currentChannelTitle.textContent = channel;
    messageInput.placeholder = "Message #" + channel;

    // Update active class on left sidebar
    var channels = channelsListContainer.querySelectorAll('.channel');
    channels.forEach(function (el) {
        if (el.textContent.includes(channel)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function onError(error) {
    var div = document.createElement('div');
    div.classList.add('event-message');
    div.textContent = '⚠️ Could not connect to server. Check if backend is running on ' + (serverUrlInput.value.trim() || 'http://localhost:8080');
    div.style.color = '#ED4245';
    messageArea.appendChild(div);
}

function sendMessage(event) {
    var messageContent = messageInput.value.trim();

    if (messageContent && stompClient) {
        var chatMessage = {
            sender: username,
            content: messageContent,
            type: 'CHAT',
            channel: currentChannel
        };

        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
        messageInput.value = '';
    }
    event.preventDefault();
}

function onMessageReceived(payload) {
    var message = JSON.parse(payload.body);

    if (message.type === 'USERS_LIST') {
        updateMembersList(message.activeUsers);
        return;
    } else if (message.type === 'CHANNEL_CREATE') {
        var chan = message.channel;
        if (!knownChannels.includes(chan)) {
            knownChannels.push(chan);
            appendChannelToUI(chan);
        }
        return;
    } else if (message.type === 'TYPING') {
        // Show typing indicator
        if (message.sender !== username && message.channel === currentChannel) {
            typingUsers[message.sender] = Date.now();
            updateTypingIndicator();
            // Clear after 3 seconds if no more typing events
            setTimeout(function () {
                if (Date.now() - typingUsers[message.sender] >= 2900) {
                    delete typingUsers[message.sender];
                    updateTypingIndicator();
                }
            }, 3000);
        }
        return;
    }

    if (message.channel && message.channel !== currentChannel) {
        return; // Ignore messages from other channels if they somehow arrive
    }

    if (message.type === 'JOIN') {
        var eventElement = document.createElement('div');
        eventElement.classList.add('event-message');
        eventElement.innerHTML = `→ <strong>${message.sender}</strong> has joined the channel!`;
        messageArea.appendChild(eventElement);
    } else if (message.type === 'LEAVE') {
        var eventElement = document.createElement('div');
        eventElement.classList.add('event-message');
        eventElement.innerHTML = `← <strong>${message.sender}</strong> has left the channel.`;
        messageArea.appendChild(eventElement);
    } else {
        // Play notification sound and flash title if window not focused
        if (!isWindowFocused && message.sender !== username) {
            // Play sound with catch block in case browser blocks autoplay
            notificationSound.play().catch(e => console.log("Audio play blocked by browser."));

            unreadMessagesCount++;
            if (!titleBlinkInterval) {
                titleBlinkInterval = setInterval(function () {
                    document.title = document.title === originalTitle ?
                        `(${unreadMessagesCount}) New messages!` : originalTitle;
                }, 1000);
            }
        }

        // Chat Message
        var messageElement = document.createElement('div');
        messageElement.classList.add('message-wrapper');

        // Avatar
        var avatarElement = document.createElement('div');
        avatarElement.classList.add('message-avatar');
        if (message.senderAvatarUrl) {
            avatarElement.style.backgroundImage = 'url(' + message.senderAvatarUrl + ')';
            avatarElement.style.backgroundSize = 'cover';
            avatarElement.style.backgroundPosition = 'center';
            avatarElement.style.backgroundColor = 'transparent';
        } else {
            avatarElement.style.backgroundColor = message.senderColor || getAvatarColor(message.sender);
            avatarElement.textContent = message.sender ? message.sender[0].toUpperCase() : '?';
        }

        // Content Wrapper
        var contentWrapperElement = document.createElement('div');
        contentWrapperElement.classList.add('message-content-wrapper');

        // Header (Name + Time)
        var headerElement = document.createElement('div');
        headerElement.classList.add('message-header');

        var nameElement = document.createElement('span');
        nameElement.classList.add('message-author');
        nameElement.style.color = message.senderColor || getAvatarColor(message.sender);
        nameElement.textContent = message.sender;

        var timeElement = document.createElement('span');
        timeElement.classList.add('message-time');

        // Use server timestamp if available, else local time
        var msgTimeText = "";
        if (message.timestamp) {
            // Example message.timestamp: "2023-10-27T14:32:00.123"
            var dateObj = new Date(message.timestamp);
            msgTimeText = `Today at ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        } else {
            var now = new Date();
            msgTimeText = `Today at ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
        timeElement.textContent = msgTimeText;

        headerElement.appendChild(nameElement);
        headerElement.appendChild(timeElement);

        // Text or Image
        var textElement = document.createElement('div');
        textElement.classList.add('message-text');

        if (message.type === 'IMAGE') {
            var content = message.content || '';
            if (content.startsWith('data:audio')) {
                // Voice note - render as audio player
                var audioEl = document.createElement('audio');
                audioEl.controls = true;
                audioEl.src = content;
                audioEl.style.marginTop = '5px';
                audioEl.style.maxWidth = '300px';
                textElement.appendChild(audioEl);
            } else {
                // Image
                var imgElement = document.createElement('img');
                imgElement.src = content;
                imgElement.style.maxWidth = '300px';
                imgElement.style.maxHeight = '300px';
                imgElement.style.borderRadius = '5px';
                imgElement.style.marginTop = '5px';
                imgElement.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
                imgElement.style.cursor = 'pointer';
                imgElement.addEventListener('click', function () {
                    window.open(imgElement.src, '_blank');
                });
                textElement.appendChild(imgElement);
            }
        } else {
            textElement.innerHTML = parseMarkdown(message.content || '');
        }

        contentWrapperElement.appendChild(headerElement);
        contentWrapperElement.appendChild(textElement);

        messageElement.appendChild(avatarElement);
        messageElement.appendChild(contentWrapperElement);

        // Store message ID for context menu (edit/delete)
        if (message.id) {
            messageElement.dataset.messageId = message.id;
            messageElement.dataset.sender = message.sender;
            messageElement.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                if (message.sender === username) {
                    selectedMessageId = message.id;
                    selectedMessageElement = messageElement;
                    contextMenu.style.top = e.clientY + 'px';
                    contextMenu.style.left = e.clientX + 'px';
                    contextMenu.classList.remove('hidden');
                }
            });
        }

        messageArea.appendChild(messageElement);
    }

    messageArea.scrollTop = messageArea.scrollHeight;
}

function getAvatarColor(messageSender) {
    var hash = 0;
    for (var i = 0; i < messageSender.length; i++) {
        hash = 31 * hash + messageSender.charCodeAt(i);
    }
    var index = Math.abs(hash % colors.length);
    return colors[index];
}

var imageUpload = document.querySelector('#image-upload');

function resizeImageAndSend(file) {
    if (!file.type.match(/image.*/)) return;

    var reader = new FileReader();
    reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');

            // Limit image dimensions to 800x800 to prevent WebSockets from crashing
            var MAX_WIDTH = 800;
            var MAX_HEIGHT = 800;
            var width = img.width;
            var height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Compress image to JPEG (quality 0.7) to keep payload < 64KB
            var dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            var chatMessage = {
                sender: username,
                content: dataUrl,
                type: 'IMAGE',
                channel: currentChannel
            };
            stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

imageUpload.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (file && stompClient) {
        resizeImageAndSend(file);
    }
    imageUpload.value = '';
});

var addServerBtn = document.querySelector('.add-server');
if (addServerBtn) {
    addServerBtn.addEventListener('click', function () {
        alert("Wielu serwerów jeszcze nie obsługujemy! Funkcja tworzenia nowych serwerów pojawi się w kolejnej aktualizacji.");
    });
}

usernameForm.addEventListener('submit', connect, true)
messageForm.addEventListener('submit', sendMessage, true)

// ========== TYPING INDICATOR ==========
function updateTypingIndicator() {
    var names = Object.keys(typingUsers);
    if (names.length === 0) {
        typingIndicator.innerHTML = '';
    } else if (names.length === 1) {
        typingIndicator.innerHTML = '<strong>' + names[0] + '</strong> is typing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    } else if (names.length <= 3) {
        typingIndicator.innerHTML = '<strong>' + names.join(', ') + '</strong> are typing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    } else {
        typingIndicator.innerHTML = 'Several people are typing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    }
}

messageInput.addEventListener('input', function () {
    if (stompClient && messageInput.value.trim().length > 0) {
        if (!typingTimeout) {
            stompClient.send("/app/chat.typing", {}, JSON.stringify({
                sender: username, type: 'TYPING', channel: currentChannel
            }));
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function () { typingTimeout = null; }, 2000);
    }
});

// ========== MARKDOWN PARSER ==========
function parseMarkdown(text) {
    // Escape HTML first
    var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Code blocks: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold: **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Underline: __text__
    escaped = escaped.replace(/__([^_]+)__/g, '<u>$1</u>');
    // Strikethrough: ~~text~~
    escaped = escaped.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    return escaped;
}

// ========== EMOJI PICKER ==========
var popularEmojis = [
    '😀', '😂', '🥹', '😍', '🤩', '😎', '🥳', '😭',
    '🤔', '🙄', '😱', '🤯', '🥺', '😤', '🤡', '👻',
    '👍', '👎', '👏', '🙌', '💪', '🤝', '✌️', '🤞',
    '❤️', '🔥', '⭐', '💯', '✅', '❌', '⚡', '💀',
    '🎮', '🎵', '🎉', '🏆', '💎', '🚀', '🌟', '🍕',
    '😈', '💩', '🐱', '🐶', '🦄', '🌈', '☀️', '🌙'
];

// Populate emoji grid
popularEmojis.forEach(function (emoji) {
    var span = document.createElement('span');
    span.className = 'emoji-item';
    span.textContent = emoji;
    span.addEventListener('click', function () {
        messageInput.value += emoji;
        messageInput.focus();
    });
    emojiPanel.appendChild(span);
});

emojiBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    emojiPanel.classList.toggle('hidden');
});

// Close emoji panel when clicking elsewhere
document.addEventListener('click', function (e) {
    if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
        emojiPanel.classList.add('hidden');
    }
    // Also close context menu
    if (!contextMenu.contains(e.target)) {
        contextMenu.classList.add('hidden');
    }
});

// ========== SEARCH ==========
searchBtn.addEventListener('click', function () {
    searchInput.classList.toggle('hidden');
    if (!searchInput.classList.contains('hidden')) {
        searchInput.focus();
    }
});

var searchDebounce = null;
searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    var query = searchInput.value.trim();
    if (query.length < 2) return;
    searchDebounce = setTimeout(function () {
        var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
        fetch(serverUrl + '/api/messages/' + currentChannel + '/search?q=' + encodeURIComponent(query), {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        })
            .then(r => r.json())
            .then(results => {
                messageArea.innerHTML = '<div class="event-message">🔍 Search results for "' + query + '" (' + results.length + ' found)</div>';
                results.forEach(msg => onMessageReceived({ body: JSON.stringify(msg) }));
            })
            .catch(err => console.error('Search error:', err));
    }, 400);
});

searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.classList.add('hidden');
        // Reload normal channel
        subscribeToChannel(currentChannel);
    }
});

// ========== CONTEXT MENU (EDIT / DELETE) ==========
ctxDelete.addEventListener('click', function () {
    if (selectedMessageId) {
        var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
        fetch(serverUrl + '/api/messages/' + selectedMessageId, {
            method: 'DELETE',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        }).then(function () {
            if (selectedMessageElement) selectedMessageElement.remove();
            contextMenu.classList.add('hidden');
        }).catch(err => console.error('Delete error:', err));
    }
});

var editModalOverlay = document.querySelector('#edit-modal-overlay');
var editModalInput = document.querySelector('#edit-modal-input');
var editModalSave = document.querySelector('#edit-modal-save');
var editModalCancel = document.querySelector('#edit-modal-cancel');

ctxEdit.addEventListener('click', function () {
    if (selectedMessageId && selectedMessageElement) {
        var textEl = selectedMessageElement.querySelector('.message-text');
        var oldText = textEl.textContent.replace(/\(edited\)$/, '').trim();
        editModalInput.value = oldText;
        editModalOverlay.classList.remove('hidden');
        editModalInput.focus();
        contextMenu.classList.add('hidden');
    }
});

editModalSave.addEventListener('click', function () {
    var newText = editModalInput.value.trim();
    if (newText.length > 0 && selectedMessageId && selectedMessageElement) {
        var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
        var textEl = selectedMessageElement.querySelector('.message-text');
        fetch(serverUrl + '/api/messages/' + selectedMessageId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ content: newText })
        }).then(function (r) { return r.json(); })
            .then(function (updated) {
                textEl.innerHTML = parseMarkdown(updated.content) + ' <span style="font-size:10px;color:var(--text-muted);">(edited)</span>';
            }).catch(function (err) { console.error('Edit error:', err); });
    }
    editModalOverlay.classList.add('hidden');
});

editModalCancel.addEventListener('click', function () {
    editModalOverlay.classList.add('hidden');
});

editModalOverlay.addEventListener('click', function (e) {
    if (e.target === editModalOverlay) editModalOverlay.classList.add('hidden');
});

editModalInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editModalSave.click();
    }
    if (e.key === 'Escape') {
        editModalOverlay.classList.add('hidden');
    }
});

// ========== PRIVATE MESSAGES (DMs) ==========
function startDM(targetUser) {
    if (targetUser === username) return;
    // Create a unique DM channel name (alphabetical order for consistency)
    var users = [username, targetUser].sort();
    var dmChannel = 'dm-' + users[0] + '-' + users[1];

    if (!knownChannels.includes(dmChannel)) {
        knownChannels.push(dmChannel);
        var div = document.createElement('div');
        div.className = 'channel dm-channel';
        div.innerHTML = '<span class="hash"></span> ' + targetUser;
        div.onclick = function () { switchChannel(dmChannel); };
        channelsListContainer.appendChild(div);

        // Tell backend
        stompClient.send("/app/chat.createChannel", {}, JSON.stringify({
            sender: username, channel: dmChannel, type: 'CHANNEL_CREATE'
        }));
    }
    switchChannel(dmChannel);
}

function updateMembersList(usersList) {
    membersListContainer.innerHTML = '';
    onlineCount.textContent = usersList.length;

    usersList.forEach(user => {
        var memberDiv = document.createElement('div');
        memberDiv.className = 'member-item';

        var avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        avatar.style.backgroundColor = getAvatarColor(user);
        avatar.textContent = user[0].toUpperCase();

        var nameSpan = document.createElement('div');
        nameSpan.className = 'member-name';
        nameSpan.textContent = user;

        memberDiv.appendChild(avatar);
        memberDiv.appendChild(nameSpan);

        // Fetch user role and add badge
        var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';
        (function (mDiv, uName) {
            fetch(serverUrl + '/api/auth/role?username=' + encodeURIComponent(uName), {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            }).then(r => r.json()).then(data => {
                if (data.role && data.role !== 'USER') {
                    var badge = document.createElement('span');
                    badge.className = 'role-badge ' + data.role.toLowerCase();
                    badge.textContent = data.role;
                    mDiv.querySelector('.member-name').appendChild(badge);
                }
            }).catch(() => { });
        })(memberDiv, user);

        memberDiv.title = 'Click to send DM to ' + user;
        memberDiv.addEventListener('click', function () { startDM(user); });
        membersListContainer.appendChild(memberDiv);
    });
}

// ========== AUTH TAB SWITCHING ==========
window.switchAuthTab = function (mode) {
    authMode = mode;
    document.querySelector('#tab-login').classList.toggle('active', mode === 'login');
    document.querySelector('#tab-register').classList.toggle('active', mode === 'register');
    document.querySelector('#auth-submit-btn').textContent = mode === 'login' ? 'Log In' : 'Register';
    document.querySelector('#auth-error').style.display = 'none';
};

// ========== VOICE RECORDING ==========
voiceBtn.addEventListener('click', function () {
    if (!isRecording) {
        // Start recording
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                mediaRecorder = new MediaRecorder(stream);
                var chunks = [];
                mediaRecorder.ondataavailable = function (e) { chunks.push(e.data); };
                mediaRecorder.onstop = function () {
                    var blob = new Blob(chunks, { type: 'audio/webm' });
                    var reader = new FileReader();
                    reader.onload = function (ev) {
                        var chatMessage = {
                            sender: username,
                            content: ev.target.result,
                            type: 'IMAGE', // Reuse IMAGE type for audio (base64 data)
                            channel: currentChannel
                        };
                        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
                    };
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                voiceBtn.classList.add('recording');
                voiceBtn.textContent = '⏹️';
            })
            .catch(function (err) {
                alert('Microphone access denied or unavailable.');
                console.error('Mic error:', err);
            });
    } else {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = '🎤';
    }
});

// ========== SETTINGS MODAL ==========
var settingsModalOverlay = document.querySelector('#settings-modal-overlay');
var settingsToggle = document.querySelector('#settings-toggle');
var settingsCancel = document.querySelector('#settings-modal-cancel');
var settingsSave = document.querySelector('#settings-modal-save');
var settingsAvatarPreview = document.querySelector('#settings-avatar-preview');
var settingsAvatarInput = document.querySelector('#settings-avatar-input');
var settingsColorInput = document.querySelector('#settings-color-input');
var settingsPasswordInput = document.querySelector('#settings-password-input');

var currentAvatarBase64 = null;

if (settingsToggle) {
    settingsToggle.addEventListener('click', function () {
        var serverUrl = window._serverUrl || 'http://localhost:8080';
        fetch(serverUrl + '/api/auth/profile?username=' + encodeURIComponent(username), {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        }).then(r => {
            if (r.ok) return r.json();
            throw new Error('Profile fetch failed');
        }).then(profile => {
            // Populate fields
            if (profile.avatarUrl) {
                currentAvatarBase64 = profile.avatarUrl;
                settingsAvatarPreview.style.backgroundImage = 'url(' + profile.avatarUrl + ')';
                settingsAvatarPreview.textContent = '';
            } else {
                currentAvatarBase64 = null;
                settingsAvatarPreview.style.backgroundImage = 'none';
                settingsAvatarPreview.style.backgroundColor = profile.color || getAvatarColor(username);
                settingsAvatarPreview.textContent = username[0].toUpperCase();
            }
            if (profile.color) {
                settingsColorInput.value = profile.color;
            } else {
                settingsColorInput.value = getAvatarColor(username);
            }
            settingsPasswordInput.value = '';
            settingsModalOverlay.classList.remove('hidden');
        }).catch(e => {
            alert('Could not load profile. Are you logged in?');
        });
    });
}

if (settingsCancel) {
    settingsCancel.addEventListener('click', () => settingsModalOverlay.classList.add('hidden'));
}

if (settingsAvatarInput) {
    settingsAvatarInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (evt) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var maxSize = 256;
                var ratio = Math.min(maxSize / img.width, maxSize / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                // Crop to circle approach by drawing in center
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                currentAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);

                settingsAvatarPreview.style.backgroundImage = 'url(' + currentAvatarBase64 + ')';
                settingsAvatarPreview.textContent = '';
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    });
}

if (settingsSave) {
    settingsSave.addEventListener('click', function () {
        var serverUrl = window._serverUrl || 'http://localhost:8080';
        var payload = {
            username: username,
            color: settingsColorInput.value,
            avatarUrl: currentAvatarBase64
        };
        if (settingsPasswordInput.value.trim().length > 0) {
            payload.newPassword = settingsPasswordInput.value;
        }

        fetch(serverUrl + '/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(payload)
        }).then(r => r.json()).then(res => {
            if (res.success) {
                settingsModalOverlay.classList.add('hidden');
                // Update local profile UI
                userColor = payload.color;
                var profileAvatar = document.querySelector('#user-profile-avatar');
                if (payload.avatarUrl) {
                    profileAvatar.style.backgroundImage = 'url(' + payload.avatarUrl + ')';
                    profileAvatar.style.backgroundColor = 'transparent';
                    profileAvatar.textContent = '';
                } else {
                    profileAvatar.style.backgroundImage = 'none';
                    profileAvatar.style.backgroundColor = userColor;
                    profileAvatar.textContent = username[0].toUpperCase();
                }
            } else {
                alert(res.error || 'Failed to update profile');
            }
        }).catch(e => console.error(e));
    });
}

// ========== ADMIN PANEL ==========
var adminPanelToggle = document.querySelector('#admin-panel-toggle');
var adminModalOverlay = document.querySelector('#admin-modal-overlay');
var adminModalClose = document.querySelector('#admin-modal-close');
var adminUsersList = document.querySelector('#admin-users-list');

if (adminPanelToggle) {
    adminPanelToggle.addEventListener('click', loadAdminUsers);
}

if (adminModalClose) {
    adminModalClose.addEventListener('click', () => adminModalOverlay.classList.add('hidden'));
}

function loadAdminUsers() {
    var serverUrl = window._serverUrl || 'http://localhost:8080';
    fetch(serverUrl + '/api/auth/users?adminUsername=' + encodeURIComponent(username), {
        headers: { 'ngrok-skip-browser-warning': 'true' }
    }).then(r => {
        if (!r.ok) throw new Error('Not authorized or error fetching users');
        return r.json();
    }).then(users => {
        adminUsersList.innerHTML = '';
        users.forEach(u => {
            var item = document.createElement('div');
            item.className = 'admin-user-item';

            var info = document.createElement('div');
            info.className = 'admin-user-info';

            var avatar = document.createElement('div');
            avatar.className = 'admin-user-avatar';
            if (u.avatarUrl) {
                avatar.style.backgroundImage = 'url(' + u.avatarUrl + ')';
            } else {
                avatar.style.backgroundColor = u.color || getAvatarColor(u.username);
                avatar.textContent = u.username[0].toUpperCase();
            }

            var name = document.createElement('div');
            name.className = 'admin-user-name';
            name.textContent = u.username;

            var role = document.createElement('div');
            role.className = 'admin-user-role role-' + u.role.toLowerCase();
            role.textContent = u.role;

            info.appendChild(avatar);
            info.appendChild(name);
            info.appendChild(role);

            var actions = document.createElement('div');
            actions.className = 'admin-user-actions';

            if (u.username !== username) { // Don't let admin modify themselves easily here to prevent lockout
                if (u.role === 'USER') {
                    var promoteBtn = document.createElement('button');
                    promoteBtn.className = 'admin-btn admin-btn-promote';
                    promoteBtn.textContent = 'Make Mod';
                    promoteBtn.onclick = () => changeUserRole(u.username, 'MODERATOR');
                    actions.appendChild(promoteBtn);
                } else if (u.role === 'MODERATOR') {
                    var promoteBtn = document.createElement('button');
                    promoteBtn.className = 'admin-btn admin-btn-promote';
                    promoteBtn.textContent = 'Make Admin';
                    promoteBtn.onclick = () => changeUserRole(u.username, 'ADMIN');
                    actions.appendChild(promoteBtn);

                    var demoteBtn = document.createElement('button');
                    demoteBtn.className = 'admin-btn admin-btn-demote';
                    demoteBtn.textContent = 'Demote';
                    demoteBtn.onclick = () => changeUserRole(u.username, 'USER');
                    actions.appendChild(demoteBtn);
                } else if (u.role === 'ADMIN') {
                    var demoteBtn = document.createElement('button');
                    demoteBtn.className = 'admin-btn admin-btn-demote';
                    demoteBtn.textContent = 'Demote Mod';
                    demoteBtn.onclick = () => changeUserRole(u.username, 'MODERATOR');
                    actions.appendChild(demoteBtn);
                }

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'admin-btn admin-btn-delete';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => deleteUser(u.username);
                actions.appendChild(deleteBtn);
            }

            item.appendChild(info);
            item.appendChild(actions);
            adminUsersList.appendChild(item);
        });
        adminModalOverlay.classList.remove('hidden');
    }).catch(err => {
        console.error(err);
        alert('Could not load users. Are you an Admin?');
    });
}

function changeUserRole(targetUser, newRole) {
    if (!confirm(`Are you sure you want to change ${targetUser}'s role to ${newRole}?`)) return;
    var serverUrl = window._serverUrl || 'http://localhost:8080';
    fetch(serverUrl + '/api/auth/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ username: targetUser, role: newRole, adminUsername: username })
    }).then(r => r.json()).then(res => {
        if (res.error) alert(res.error);
        else loadAdminUsers(); // refresh list
    }).catch(e => console.error(e));
}

function deleteUser(targetUser) {
    if (!confirm(`WARNING: Are you sure you want to completely delete the user '${targetUser}'? This cannot be undone.`)) return;
    var serverUrl = window._serverUrl || 'http://localhost:8080';
    fetch(serverUrl + '/api/auth/users/' + encodeURIComponent(targetUser) + '?adminUsername=' + encodeURIComponent(username), {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' }
    }).then(r => {
        if (r.ok) return r.json();
        throw new Error('Delete failed');
    }).then(res => {
        if (res.error) alert(res.error);
        else loadAdminUsers(); // refresh list
    }).catch(e => console.error(e));
}
