const shuffle = require("./util/ShuffleArray");
const GingloidPlayer = require("./GingloidPlayer");
const { CardColor, CardValue, GingloidCard } = require("./GingloidCard");
const generateId = require("./util/IDGenerator");
const DiscardPile = require("./cardpile/DiscardPile");
const DrawPile = require("./cardpile/DrawPile");
const { PlayResult } = require("./GingloidState");


class GingloidGame {
  constructor() {

    // map between a token and a player
    /** @type {Map<String, GingloidPlayer>} */
    this.players = new Map();

    // array of player tokens
    this.tokens = [];

    // true if the game has started -- will reject players
    this.gameStarted = false;

    // list of cards to be drawn -- last card is top of pile.
    /** @type {DrawPile} */
    this.drawPile = new DrawPile();

    /** @type {DiscardPile} */
    this.discardPile = new DiscardPile();

    // the next player to go
    this.nextPlayer = 0;

    // true if we are going in reverse order -- false otherwise
    this.reversed = false;

    // true if the game is over!
    this.gameEnded = false;

    this.cardCount = 0;
  }

  /**
   * Called when a new player joins the game.
   * @param {String} name - the name of the new player
   * @returns {string} the id of the new player.
   */  
  generatePlayer(name) {
    // called when a player joins a game - returns their token, and adds their player to an internal list
    if (!this.gameStarted) {
      let playerToken;
      do {
        playerToken = generateId(16);
      } while (this.players.get(playerToken));
      this.players.set(playerToken, new GingloidPlayer(name));
      this.tokens.push(playerToken);
      return playerToken;
    }

    return null;
  }

  /**
   * Removes a player based on their token.
   * @param {string} playerToken - the token of the player being removed
   * @returns true if the player was removed, false if they did not exist.
   */
  removePlayer(playerToken) {
    // verify that the token exists
    for (let i = 0; i < this.tokens.length; i++) {
      if (playerToken === this.tokens[i]) {
        // put their cards into the draw pile, and reshuffle.
        let player = this.players.get(playerToken);
        for (let card of player.cards) {
          this.drawPile.addCard(card);
        }
        
        this.drawPile.shuffleDeck();

        // remove the player from the game
        this.players.delete(playerToken);
        // fix any erroneous game state (adjust next player, etc).
        if (this.nextPlayer == i && this.reversed) {
          this.advancePlayer();
        } else if (this.nextPlayer > i) {
          this.nextPlayer--;
        }

        this.tokens.splice(i, 1);
        return true;
      }
    }

    return false;
  }

  fillDrawPile() {
    for (let color in CardColor) {
      if (CardColor.hasOwnProperty(color)) {
        let col = CardColor[color];
        for (let value in CardValue) {
          if (CardValue.hasOwnProperty(value)) {
            let str = CardValue[value];
            if (str === CardValue.WILD) {
              continue;
            }

            this.drawPile.addCard(new GingloidCard(col, str, this.cardCount++));
            if (str !== CardValue.ZERO
              && str !== CardValue.PICK
              && str !== CardValue.PICKFOUR) {
                this.drawPile.addCard(new GingloidCard(col, str, this.cardCount++));
            }
          }
        }
      }
    }
  }

  /**
   * Starts a game of Gingloids.
   */
  startGame() {
    this.gameStarted = true;
    // set up draw pile
      // generate cards
    this.fillDrawPile();
    
    // shuffle the deck
    this.drawPile.shuffleDeck();
    // shuffle turn order
    shuffle(this.tokens);

    for (let i = 0; i < 7; i++) {
      for (let player of this.players.values()) {
        // give each player one card
        player.addCard(this.drawPile.drawCard());
      }
    }

    // draw from our draw pile to create the discard pile
    this.prepareDiscardPile();
  }

  /**
   * Prepares the discard pile.
   */
  prepareDiscardPile() {
    let discard = this.drawPile.drawCard();
    while (discard.value === CardValue.PICK || discard.value === CardValue.PICKFOUR) {
      this.discardPile.forceDiscard(discard);
      discard = this.drawPile.drawCard();
    }

    this.discardPile.forceDiscard(discard);
  }

  /**
   * @returns {Map.<String, GingloidPlayer>} - an map associating player tokens with players.
   */
  getPlayers() {
    return this.players;
  }

  /**
   * 
   * @param {String} token - the token associated with the desired player.
   * @returns the player if its exists -- otherwise, null.
   */
  getPlayer(token) {
    return this.players.get(token);
  }

  getDiscardPile() {
    return this.discardPile;
  }

  /**
   * @returns {String} - the token of the player who is playing next
   */
  getNextPlayer() {
    return this.tokens[this.nextPlayer];
  }

  /**
   * Called whenever a player must draw a card.
   * @param {String} token - the token of the player drawing a card.
   */
  drawCard(token) {
    if (this.players.get(token)) {

      if (this.getNextPlayer() !== token) {
        return;
      }

      if (this.drawPile.empty()) {
        this.fillDrawPile();
        this.drawPile.shuffleDeck();
      }

      this.players.get(token).addCard(this.drawPile.drawCard());
      return true;
    }

    return false;
  }

  advancePlayer() {
    this.nextPlayer += (this.reversed ? -1 : 1);
    while (this.nextPlayer < 0) {
      this.nextPlayer += this.players.size;
    } 
    
    while (this.nextPlayer >= this.players.size) {
      this.nextPlayer -= this.players.size;
    }

    console.log(this.players.size);

    console.log("NEXT PLAYER: " + this.nextPlayer);
  }

  /**
   * Called when a player plays a card.
   * @param {String} token - the token of the player playing the card
   * @param {number} card - id of the card being played by the player
   * @param {Object} opts - additional options for cards.
   * @param {CardColor} opts.color - if a color pick card is played, specifies which color should be used next.
   * @returns {PlayResult | boolean} truthy if play is valid, falsy if not.
   */
  playCard(token, card, opts) {
    // verify that the token is associated with the player which is going next
    if (this.getNextPlayer() !== token) {
      console.log("invalid turn order!");
      return false;
    }

    // verify that the card is in that player's hand
    let returnPacket = {
      win: "",
      global: "",
      local: {
        affectedToken: "",
        result: ""
      }
    };
    let player = this.players.get(token);
    let cardHand = player.findCardById(card);
    console.log(player.cards);
    if (cardHand === null) {
      // user claimed to have a card they don't have.
      console.error("player played card that they don't own");
      return false;
    }

    // user has the card -- confirm that it can be discarded
    if (this.discardPile.discard(cardHand, opts)) {
      // card can be discarded -- play is valid!
      player.removeCard(cardHand.id);
      console.log(cardHand);
      if (player.cards.length <= 0) {
        // the game ended
        returnPacket.win = player.name + " wins!";
        this.gameEnded = true;
        return returnPacket;
      } else {
        // handle its logic
        switch (cardHand.value) {
          case CardValue.SKIP:
            this.advancePlayer();
            returnPacket.local.affectedToken = this.getNextPlayer();
            returnPacket.local.result = this.getPlayer(token).name + " skipped you!";
            break;
          case CardValue.REVERSE:
            this.reversed = !this.reversed;
            returnPacket.global = this.getPlayer(token).name + " reversed flow of gameplay!";
            break;
          case CardValue.DRAWTWO:
            this.advancePlayer();
            this.drawCard(this.tokens[this.nextPlayer]);
            this.drawCard(this.tokens[this.nextPlayer]);
            returnPacket.local.affectedToken = this.getNextPlayer();
            returnPacket.local.result = this.getPlayer(token).name + " forced you to draw two cards!";
            // how do we warn the player that receives these cards?
            // return some add'l data indicating the token of the player receiving these cards?
            // idk
            // can you combo off of a draw two?
            // i think its natural
            break;
          case CardValue.PICKFOUR:
            this.advancePlayer();
            this.drawCard(this.tokens[this.nextPlayer]);
            this.drawCard(this.tokens[this.nextPlayer]);
            this.drawCard(this.tokens[this.nextPlayer]);
            this.drawCard(this.tokens[this.nextPlayer]);
            returnPacket.global = this.getPlayer(token).name + " changed play color to " + opts.color + "!";
            returnPacket.local.affectedToken = this.getNextPlayer();
            returnPacket.local.result = this.getPlayer(token).name + " forced you to draw four cards!";
            break;
          case CardValue.PICK:
            returnPacket.global = returnPacket.global = this.getPlayer(token).name + " changed play color to " + opts.color + "!";
            break;
        }
        
        console.log("play was valid!");
        this.advancePlayer();
        return returnPacket;
      }
    }
  
    // card could not be discarded -- invalid play
    console.log("card was not a valid play");
    return false;
  }
}

module.exports.GingloidGame = GingloidGame;