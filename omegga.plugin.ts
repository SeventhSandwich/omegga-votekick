import OmeggaPlugin, { OL, PS, PC } from 'omegga';

type Config = { foo: string };
type Storage = { bar: string };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  votekickTimeout: NodeJS.Timeout;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }


  async init() {
    this.votesYes = 0;
    this.votesNo = 0;
    this.openVote = 0; //whether a vote is currently running
    this.canVoteKick = 1; //whether the votekick command is in cooldown
    this.disabledUsers = []; //names of people who have too recently votekicked
    this.kicker = "";
    this.targetUser = "";
    this.voters = [];

    Omegga.on('cmd:votekick', this.startvote)
    Omegga.on('cmd:vk', this.startvote)

    Omegga.on('cmd:vkyes', async (speaker: string) => {
      if (this.openVote==0) {
        Omegga.whisper(speaker,`There is no votekick to vote on.`);
        return {};
      }
      if (speaker.toLowerCase() == this.targetUser.toLowerCase()) {
        Omegga.whisper(speaker,`You cannot vote when you are being votekicked.`);
        return {};
      }
      if (this.voters.indexOf(speaker)!=-1) {
        Omegga.whisper(speaker,`You already voted.`);
        return {};
      }
      this.votesYes = this.votesYes+1;
      Omegga.whisper(speaker,`You voted yes.`);
      this.voters.push(speaker);
    })

    Omegga.on('cmd:vkno', async (speaker: string) => {
      if (this.openVote==0) {
        Omegga.whisper(speaker,`There is no votekick to vote on.`);
        return {};
      }
      if (speaker.toLowerCase() == this.targetUser.toLowerCase()) {
        Omegga.whisper(speaker,`You cannot vote when you are being votekicked.`);
        return {};
      }
      if (this.voters.indexOf(speaker)!=-1) {
        Omegga.whisper(speaker,`You already voted.`);
        return {};
      }
      this.votesNo = this.votesNo+1;
      Omegga.whisper(speaker,`You voted no.`);
      this.voters.push(speaker);
    })

    Omegga.on('cmd:cancelvote', async (speaker: string) => {
      if (this.openVote==0) {
        Omegga.whisper(speaker,`There is no votekick to cancel.`);
        return {};
      }
      if (Omegga.getPlayer(speaker).isHost() || Omegga.getPlayer(speaker).name==this.kicker) {
        if (this.votekickTimeout) {
          clearTimeout(this.votekickTimeout);
        }
        this.canVoteKick = 1;
        this.openVote = 0;
        this.kicker = "";
        Omegga.broadcast(`<b>The votekick has been canceled.</>`);
      } else {
        Omegga.whisper(speaker,`Only the host or the person who started the votekick can /cancelvote.`);
        return {};
      }
    });

    return { registeredCommands: ['votekick','vk','cancelvote','vkyes','vkno'] };
  }

  startvote = async (senderName, targetName) => {
    //Check if a vote can even be started
    if (this.config["Whitelist Mode"]) {
      if (!this.config['Whitelisted Players'].some(p => Omegga.getPlayer(senderName).id === p.id)) {
        Omegga.whisper(senderName,`Whitelist mode is enabled. Only whitelisted players can use /votekick.`);
        return [];
      }
    }
    if (Omegga.getPlayers().length < this.config["Minimum Server Population"]) {
      Omegga.whisper(senderName,`A votekick cannot be started with fewer than ${this.config["Minimum Server Population"]} players online.`);
      return {};
    }
    if (this.openVote == 1) {
      Omegga.whisper(senderName,`A votekick is already in progess.`);
      return {};
    }
    if (this.canVoteKick == 0 || this.disabledUsers.indexOf(senderName)!=-1) {
      Omegga.whisper(senderName,`Please wait a bit before starting a new votekick.`);
      return {};
    }

    //Check if the target has a valid name
    if (typeof targetName == "undefined") {
      Omegga.whisper(senderName,`Start a votekick by typing: /votekick [Name]`);
      return {};
    }
    if (typeof Omegga.findPlayerByName(targetName).name == "undefined") {
      Omegga.whisper(senderName,`Could not find a player with that name.`);
      return {};
    } else {
      targetName = Omegga.findPlayerByName(targetName).name;
    }
    if (targetName==senderName) {
      Omegga.whisper(senderName,`You cannot votekick yourself.`);
      return {};
    }

    //Check if the target is an exempt role
    if (Omegga.getPlayer(targetName).isHost()) {
     Omegga.whisper(senderName,`You cannot votekick the host, duh!`);
     return {};
    }

    for (let role of this.config["Exempt Roles"]) {
        if (Omegga.getPlayer(targetName).getRoles().indexOf(role)!=-1) {
          Omegga.whisper(senderName,`You cannot votekick a ${role}.`);
          return {};
        }
    }

    //Close the votekick command and open voting
    this.canVoteKick = 0;
    this.openVote = 1;
    this.targetUser = targetName;
    this.kicker = senderName;

    Omegga.broadcast(`<b><color="#047000">${senderName}</> has started a vote to kick <color="#b80f00">${targetName}</> | Vote with <color="#0040b8">/vkYes</> or <color="#0040b8">/vkNo.</> There are ${this.config["Vote Time"]} seconds for voting.</>`);

    //person starting the votekick presumably wants to vote yes.
    this.votesYes = this.votesYes+1;
    Omegga.whisper(senderName,`You voted yes.`);
    this.voters.push(senderName);

    //credit to x/voximity for advice on JS timeouts
    this.votekickTimeout = setTimeout(async () => {
      this.openVote = 0;

      this.tallyvotes(senderName, targetName); //see if we kick
      this.cooldown(); //cool down votekick for everyone
      this.cooldownuser(senderName); //cool down votekick for the vote starter

      this.votesYes = 0;
      this.votesNo = 0;
      this.voters = [];
      this.targetUser = "";
      this.kicker = "";
    }, this.config["Vote Time"]*1000);
  }

  tallyvotes = async (senderName, targetName) => {
    const percentYes = 100*this.votesYes/(this.votesNo+this.votesYes);
    if (this.votesNo+this.votesYes < this.config["Minimum Votes"] || this.votesNo+this.votesYes < this.config["Minimum Votes (Percent of Server Pop)"]*Omegga.getPlayers().length/100) {
      Omegga.broadcast(`<b>Votekick fails (need at least ${Math.max(this.config["Minimum Votes"],Math.ceil(this.config["Minimum Votes (Percent of Server Pop)"]*Omegga.getPlayers().length/100))} votes).</>`);
    } else if (percentYes >= this.config["Percent Kick Threshold"]) {
      Omegga.broadcast(`<b>Votekick succeeds (<color="#047000">${this.votesYes}</> - <color="#b80f00">${this.votesNo}</>)</>`);
      if (this.config["Ban Length"]==0) {
        Omegga.writeln(`Chat.Command /kick \"${targetName}\" You have been votekicked off the server."`);
      } else {
        Omegga.writeln(`Chat.Command /ban "${targetName}" ${this.config["Ban Length"]} "You have been votekicked off the server for ${this.config["Ban Length"]} minutes."`);
      }
    } else {
      Omegga.broadcast(`<b>Votekick fails (<color="#047000">${this.votesYes}</> - <color="#b80f00">${this.votesNo}</>)</>`);
    }
  }

  cooldown = async () => {
    await new Promise(resolve => setTimeout(resolve, this.config["Break Time"] * 1000));
    this.canVoteKick = 1;
  }

  cooldownuser = async (senderName) => {
    this.disabledUsers.push(senderName);
    await new Promise(resolve => setTimeout(resolve, this.config["Break Time (per player)"] * 1000));
    this.disabledUsers.splice(this.disabledUsers.indexOf(senderName),1)
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
