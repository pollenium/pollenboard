const wsProtocol = document.location.protocol === 'https:' ? 'wss' : 'ws'

const client = new pollenium.Client({
  signalingServerUrls: [
    `${wsProtocol}://begonia-us-1.herokuapp.com`,
    `${wsProtocol}://begonia-eu-1.herokuapp.com`,
  ],
  bootstrapOffersTimeout: 0,
  signalTimeout: 5,
  friendsMax: 6,
  Worker: Worker,
  WebSocket: WebSocket,
  hashcashWorkerUrl: './lib/pollenium/hashcash-worker.js'
})
const applicationId = pollenium.Bytes.fromUtf8('pollenboard').getPaddedLeft(32)

console.log(client)

const app = angular.module('app', ['yaru22.angular-timeago'])

class SignalingClientComponent {
  constructor($scope, signalingClient) {
    this.signalingClient = signalingClient
    this.$scope = $scope
    this.url = signalingClient.signalingServerUrl
    this.status = 'connecting'
    this.updateStatus()
  }
  getBgClass() {
    switch(this.status) {
      case 'connecting':
        return 'bg-warning'
      case 'connected':
        return 'bg-success'
      case 'failed':
        return 'bg-danger'
    }
  }
  async updateStatus() {
    this.status = await this.signalingClient.fetchConnection().then(() => {
      return 'connected'
    }).catch(() => {
      return 'failed'
    })
    this.$scope.$apply()
  }
}

class MessageComponent {
  constructor($scope, body, isUsers) {
    this.$scope = $scope
    this.body = body
    this.bodyUtf8 = body.getUtf8()
    this.isUsers = isUsers
    this.powProgress = .01
  }
  setPowProgress(powProgress) {
    this.powProgress = powProgress
    setTimeout(() => {
      this.$scope.$apply()
    })
  }
  increasePowProgress() {
    if (this.powProgress >= .9) {
      return
    }
    this.setPowProgress(this.powProgress + ((1 - this.powProgress) / 4))
  }
  async broadcast() {
    this.setPowProgress(.1)
    this.powProgressInterval = setInterval(() => {
      this.increasePowProgress()
    }, 1000)

    const friendMessageGenerator = new pollenium.FriendMessageGenerator(
      client,
      applicationId,
      this.body,
      8
    )
    const friendMessage = await friendMessageGenerator.fetchFriendMessage()
    friendMessage.broadcast()
    this.isBroadcast = true
    this.broadcastAt = new Date
    clearInterval(this.powProgressInterval)
    this.$scope.$apply()
  }
}

function extractIpString(offer) {
  const sdp = offer.sdpb.getUtf8()
  const sdpLines = sdp.split('\r\n')
  const ipLine = sdpLines.find((sdpLine) => {
    return sdpLine.indexOf('c=') === 0
  })
  const ipLineParts = ipLine.split(' ')
  return ipLineParts[ipLineParts.length - 1]
}

class PeerComponent {
  constructor($scope, friend) {
    this.$scope = $scope
    this.friend = friend
    this.friend.on('status', (status) => {
      this.$scope.$apply()
    })
    this.updateIpString()
  }
  getBgClass() {
    switch(this.friend.status) {
      case 0:
        return 'bg-default'
      case 1:
        return 'bg-warning'
      case 2:
        return 'bg-success'
      case 3:
        return 'bg-danger'
    }
  }
  async fetchIpString() {
    if (this.friend.offer) {
      return extractIpString(this.friend.offer)
    }
    const offer = await this.friend.fetchOffer()
    return extractIpString(offer)
  }
  async updateIpString() {
    this.ipString = await this.fetchIpString()
    this.$scope.$apply()
  }
}

app.controller('Client', ($scope) => {
  $scope.clientNonceHex = client.nonce.getHex()
})

app.controller('SignalingServers', async function SignalingServersController($scope) {
  $scope.signalingClientComponents = client.signalingClients.map((signalingClient) => {
    return new SignalingClientComponent($scope, signalingClient)
  })
})

function getFriends() {
  return client.introverts.concat(client.extroverts)
}

app.controller('Peers', async function SignalingServersController($scope) {

  $scope.peerComponents = []

  function setPeerComponents() {
    $scope.peerComponents = getFriends().filter((friend) => {
      return friend.status !== 0
    }).map((friend) => {
      return new PeerComponent($scope, friend)
    })
    $scope.$apply()
  }

  client.on('friend', setPeerComponents)
  client.on('friend.status', setPeerComponents)

})

app.controller('Messages', ($scope) => {
  function setIsConnected() {
    $scope.isConnected = getFriends().filter((friend) => {
      return friend.status === 2
    }).length > 0
    $scope.$apply()
  }

  client.on('friend', setIsConnected)
  client.on('friend.status', setIsConnected)

  $scope.messageComponents = []

  $scope.post = () => {
    const messageComponent = new MessageComponent(
      $scope,
      pollenium.Bytes.fromUtf8($scope.messageBodyUtf8),
      true
    )
    $scope.messageComponents.push(messageComponent)
    $scope.messageBodyUtf8 = ''
    setTimeout(() => {
      messageComponent.broadcast()
    })
  }

  client.on('friend.message', (friendMessage) => {
    if (!friendMessage.applicationId.equals(applicationId)) {
      return
    }
    const messageComponent = new MessageComponent($scope, friendMessage.applicationData, false)
    messageComponent.receivedAt = new Date
    $scope.messageComponents.push(messageComponent)
    $scope.$apply()
  })
})
