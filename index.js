const wsProtocol = document.location.protocol === 'https:' ? 'wss' : 'ws'

const client = new pollenium.Client({
  signalingServerUrls: [
    `${wsProtocol}://begonia-us-1.herokuapp.com`,
    `${wsProtocol}://begonia-eu-1.herokuapp.com`,
  ],
  Worker: Worker,
  WebSocket: WebSocket,
  hashcashWorkerUrl: './lib/pollenium-anemone/hashcash-worker.js'
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

class MissiveComponent {
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

    const missiveGenerator = new pollenium.MissiveGenerator(
      client,
      applicationId,
      this.body,
      8
    )
    const missive = await missiveGenerator.fetchMissive()
    missive.broadcast()
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

class FriendshipComponent {
  constructor($scope, friendship) {
    this.$scope = $scope
    this.friendship = friendship
    this.friendship.on('status', (status) => {
      this.$scope.$apply()
    })
    this.updateIpString()
  }
  getBgClass() {
    switch(this.friendship.status) {
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
    if (this.friendship.offer) {
      return extractIpString(this.friendship.offer)
    }
    const offer = await this.friendship.fetchOffer()
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

app.controller('Friendships', async function SignalingServersController($scope) {

  $scope.friendshipComponents = []

  function setFriendshipComponents() {
    $scope.friendshipComponents = getFriends().filter((friendship) => {
      return friendship.status !== 0
    }).map((friendship) => {
      return new FriendshipComponent($scope, friendship)
    })
    $scope.$apply()
  }

  client.on('friendship', setFriendshipComponents)
  client.on('friendship.status', setFriendshipComponents)

})

app.controller('Missives', ($scope) => {
  function setIsConnected() {
    $scope.isConnected = getFriends().filter((friendship) => {
      return friendship.status === 2
    }).length > 0
    $scope.$apply()
  }

  client.on('friendship', setIsConnected)
  client.on('friendship.status', setIsConnected)

  $scope.missiveComponents = []

  $scope.post = () => {
    const missiveComponent = new MissiveComponent(
      $scope,
      pollenium.Bytes.fromUtf8($scope.missiveBodyUtf8),
      true
    )
    $scope.missiveComponents.push(missiveComponent)
    $scope.missiveBodyUtf8 = ''
    setTimeout(() => {
      missiveComponent.broadcast()
    })
  }

  client.on('friendship.missive', (missive) => {
    if (!missive.applicationId.equals(applicationId)) {
      return
    }
    const missiveComponent = new MissiveComponent($scope, missive.applicationData, false)
    missiveComponent.receivedAt = new Date
    $scope.missiveComponents.push(missiveComponent)
    $scope.$apply()
  })
})

app.filter('reverse', function() {
  return function(items) {
    return items.slice().reverse();
  }
})
