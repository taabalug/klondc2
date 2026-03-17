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
var userColor = '';
var currentChannel = 'general';
var knownChannels = ['general'];

var colors = [
    '#5865F2', '#EB459E', '#ED4245', '#FEE75C',
    '#57F287', '#F47B67', '#00BCD4', '#9B59B6'
];

function connect(event) {
    username = document.querySelector('#name').value.trim();
    var serverUrl = serverUrlInput.value.trim() || 'http://localhost:8080';

    if (username) {
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');
        displayUsername.textContent = username;
        userColor = getAvatarColor(username);

        document.querySelector('.user-profile .avatar').style.backgroundColor = userColor;

        // Connect to the specified external or local server URL
        var socket = new SockJS(serverUrl + '/ws');
        stompClient = Stomp.over(socket);

        // Add ngrok bypass header just in case
        var headers = {
            'ngrok-skip-browser-warning': 'true'
        };

        stompClient.connect(headers, onConnected, onError);
    }
    event.preventDefault();
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
        stompClient.send("/app/chat.addUser", {}, JSON.stringify({ sender: username, type: 'LEAVE', channel: currentChannel }));
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
        avatarElement.style.backgroundColor = getAvatarColor(message.sender);
        avatarElement.textContent = message.sender ? message.sender[0].toUpperCase() : '?';

        // Content Wrapper
        var contentWrapperElement = document.createElement('div');
        contentWrapperElement.classList.add('message-content-wrapper');

        // Header (Name + Time)
        var headerElement = document.createElement('div');
        headerElement.classList.add('message-header');

        var nameElement = document.createElement('span');
        nameElement.classList.add('message-author');
        nameElement.style.color = getAvatarColor(message.sender);
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
            var imgElement = document.createElement('img');
            imgElement.src = message.content;
            imgElement.style.maxWidth = '300px';
            imgElement.style.maxHeight = '300px';
            imgElement.style.borderRadius = '5px';
            imgElement.style.marginTop = '5px';
            imgElement.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            textElement.appendChild(imgElement);
        } else {
            textElement.textContent = message.content;
        }

        contentWrapperElement.appendChild(headerElement);
        contentWrapperElement.appendChild(textElement);

        messageElement.appendChild(avatarElement);
        messageElement.appendChild(contentWrapperElement);

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
        membersListContainer.appendChild(memberDiv);
    });
}
