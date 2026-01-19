/**
 * Chat System - Character definitions and dialogue generation
 * 
 * This module defines characters with unique colors, speech styles, and dialogue templates.
 * Dialogue is generated automatically at random intervals to create ambient chatter.
 */

// Character definitions with unique colors and speech styles
export const CHARACTERS = {
  'Nicolas Maduro': {
    color: '#ff6b6b', // Red
    phrases: [
      "they snatched me like im some fucking doorDash order from caracas",
      "Im a fucking prisoner, not a fucking criminal",
      'they got me in leg irons rn looking like a budget breaking bad extra but guess what? STILL THE PRESIDENT BITCHES',
      'if I die here at least make the murals huge',
      '...also someone water my plants. gracias',
      'CIA probably reading this rn'


    ]
  },
  'Luigi Mangione': {
    color: '#4ecdc4', // Teal
    phrases: [
      'I miss club penguin',
      'alpha delta pi forever',
      'no hard feelings',
      'I miss my dog',
      'someone contact my mom',
      'yo reach out to my media team',
      'someone snitched on me',
      'fuck this',
    ]
  },
  'Sean Comb': {
    color: '#ffe66d', // Yellow
    phrases: [
      'aint no party like a diddy party',
      'yeah im not watching that 50cent documentary',
      'atleast i dont own a sketchy ass island maxwell',
      'can you rub this baby oil on my back?',
      'baby oil shortage in cali tonight, we movin DIFFERENT',
      'tell r.kelly we need more codeine in the shit it’s tasting too tame',
      'im not buying this whole stan stan stan shit',
    ]
  },
  'R. Kelly': {
    color: '#a8e6cf', // Light green
    style: 'mysterious',
    phrases: [
      'tell Diddy I said whats good, we can collab on the shower mixtape',
      'pissin on folks was the old me... now Im just pissin off the top bunk to assert dominance',
      'prayin for early release amen...dont want to be like tayK',
      'if this appeal dont hit im droppin "I Survived But Barely" deluxe edition 2045',
      'miss my old crib... at least the closet had better lighting for dramatic reveals',
      'they say im canceled but my catalog still slappin',
      'yo someone slide me a burner phone I got a whole opera bout these gray walls',
      'baby oil? nah they switched my commissary to just straight lube packets now smh inflation hit different',

    ]
  },
  'Sam Bankman-Fried': {
    color: '#95e1d3', // Mint
    style: 'nerdy',
    phrases: [
      'coinbase listing my mugshot as an NFT',
      'still would bone caroline in the visiting room if they let us',
      'If i die in here just tell everyone i rugged the afterlife',
      'solana still up tho',
      'fuck i didnt sell my bitcoin',
      'tell CZ i said “gg no re” from ad-seg',
      'i betgary gensler reading my text right now',

    ]
  },
  'El Chapo Guzman': {//Work from ElChapo
    color: '#f38181', // Coral
    style: 'strategic',
    phrases: [
      'tell the gringos I said whats good, we can collab on the tunnel mixtape, volume 2 got flamethrowers',
      'who you want me to cook next, carbon? hit me up',
      'yo slide me a burner Nokia I got a whole corrido about these 23-hour lockdowns',
      'they canceled my shit but my product still movin faster than ur moms onlyfan',
      'who tf is this walter white guy?',
      'miss my old crib dawg',
      'homberos chill out brochacho'


    ]
  },
  'Ghislaine Maxwell': {
    color: '#aa96da', // Lavender
    style: 'sarcastic',
    phrases: [
      'still got the best connections trust',
      'wait ignore that one photo of me',
      "youre cute thinking you can cancel royalty",
      "dont @ me unless youre on the manifest ",
      "wdym they released the files?",
      'wait lowkey i might be cooked',

    ]
  },
  'Michael Cohen': {
    color: '#ff9ff3', // Pink
    style: 'dramatic',
    phrases: [
      'they call me rat now but i was the cleaner',
      'my ndas have ndas good luck kid',
      'donald who? never heard of him',
      'yeah this is not even that bad',
      'why are people making memes of me',
      'lowkey i just placed on a trade on me getting pardoned',
      'deadass took a bullet for that man bro',
    ]
  },
  '6ix9ine': {
    color: '#ff4757', // Bright red
    style: 'aggressive',
    phrases: [
      'blicky got the stiffy',
      'i aint no rat bitches',
      'gotta do what u gotta do',
      'who the fuck is this NBA youngboy?',
      'gummo type shi',
      'day69 is still the shit',
      'idk why people keep thinkin im asian',
    ]
  },
  'Martin': {
    color: '#70a1ff', // Blue
    style: 'arrogant',
    phrases: [
      'money money money',
      'yo follow me on X guys',
      'someone said I look like ben shapiro',
      'type shi',
    ]
  }
};

// Track last spoken phrases to avoid immediate repetition
const lastPhrases = {};

/**
 * Generates a random dialogue message from a random character
 * @returns {Object} { name: string, text: string, color: string }
 */
export function generateMessage() {
  const characterNames = Object.keys(CHARACTERS);
  const randomIndex = Math.floor(Math.random() * characterNames.length);
  const characterName = characterNames[randomIndex];
  const character = CHARACTERS[characterName];
  
  // Get available phrases (exclude the last one used for this character)
  let availablePhrases = character.phrases;
  if (lastPhrases[characterName] && availablePhrases.length > 1) {
    availablePhrases = character.phrases.filter(phrase => phrase !== lastPhrases[characterName]);
  }
  
  // Pick a random phrase from available ones
  const randomPhraseIndex = Math.floor(Math.random() * availablePhrases.length);
  const selectedPhrase = availablePhrases[randomPhraseIndex];
  
  // Store as last phrase for this character
  lastPhrases[characterName] = selectedPhrase;
  
  return {
    name: characterName,
    text: selectedPhrase,
    color: character.color
  };
}

/**
 * Gets a random interval between messages (in milliseconds)
 * @returns {number} Interval in ms (between 2000 and 6000)
 */
export function getRandomInterval() {
  return 2000 + Math.random() * 4000; // 2-6 seconds
}
