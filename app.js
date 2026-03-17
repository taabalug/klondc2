'use strict';

var usernamePage = document.querySelector('#username-page');
var chatPage = document.querySelector('#chat-page');
var usernameForm = document.querySelector('#usernameForm');
var messageForm = document.querySelector('#messageForm');
var messageInput = document.querySelector('#message');
var messageArea = document.querySelector('#messageArea');
var serverUrlInput = document.querySelector('#serverUrl');
var displayUsername = document.querySelector('#display-username');

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
    subscribeToChannel(currentChannel);
}

function subscribeToChannel(channel) {
    if (currentSubscription) {
        // Send a LEAVE message to the old channel before un-subscribing 
        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify({ sender: username, type: 'LEAVE', channel: currentChannel }));
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
};

addChannelBtn.addEventListener('click', function () {
    var newChannel = prompt("Enter new channel name:");
    if (newChannel && newChannel.trim().length > 0) {
        newChannel = newChannel.trim().toLowerCase().replace(/\s+/g, '-');
        if (!knownChannels.includes(newChannel)) {
            knownChannels.push(newChannel);
            var div = document.createElement('div');
            div.className = 'channel';
            div.innerHTML = '<span class="hash">#</span> ' + newChannel;
            div.onclick = function () { switchChannel(newChannel); };
            channelsListContainer.appendChild(div);
            switchChannel(newChannel);
        } else {
            switchChannel(newChannel);
        }
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
    div.style.color = 'var(--brand-color-hover)';
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

    if (message.channel !== currentChannel) {
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
        // Chat Message
        var messageElement = document.createElement('div');
        messageElement.classList.add('message-wrapper');

        // Avatar
        var avatarElement = document.createElement('div');
        avatarElement.classList.add('message-avatar');
        avatarElement.style.backgroundColor = getAvatarColor(message.sender);
        avatarElement.textContent = message.sender[0].toUpperCase();

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
        var now = new Date();
        timeElement.textContent = `Today at ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        headerElement.appendChild(nameElement);
        headerElement.appendChild(timeElement);

        // Text
        var textElement = document.createElement('div');
        textElement.classList.add('message-text');
        textElement.textContent = message.content;

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

usernameForm.addEventListener('submit', connect, true)
messageForm.addEventListener('submit', sendMessage, true)
