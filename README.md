<!--

When uploading your plugin to github/gitlab
start your repo name with "omegga-"

example: https://github.com/SeventhSandwich/omegga-VoteKick

Your plugin will be installed via omegga install gh:SeventhSandwich/VoteKick

-->

# VoteKick

This plugin allows players on the server to start a votekick to democratically
remove problem users. A number of useful config variables are included.

Note that when the plugin is calculating the minimum total votes needed to kick, it takes
the maximum of "Minimum Votes" and "Minimum Votes (Percent of Server Pop)".

Besides that, everything is explained in the tool tips when you hover
over the config names.

## Install

`omegga install gh:SeventhSandwich/VoteKick`

## Usage
/votekick [Name]
alternatively: /vk [Name]

/cancelvote (only usable by host or person who called the vote)
/vkYes (vote yes)
/vkNo (vote no)
