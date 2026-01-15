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
      'These walls are just temporary obstacles in my master plan.',
      'I\'ve escaped worse prisons than this American joke.',
      'The guards have weaknesses, and I\'m cataloging every one.',
      'Patience is my greatest weapon in this concrete tomb.',
      'Every tunnel needs a starting point, and every plan needs time.',
      'The real battle is fought in the shadows, not the spotlight.',
      'I\'ve built empires from nothing; this cell is just another challenge.',
      'Freedom isn\'t given, it\'s taken through careful strategy.'
    ]
  },
  'Ghislaine Maxwell': {
    color: '#aa96da', // Lavender
    style: 'sarcastic',
    phrases: [
      'Oh darling, prison is just so... quaint, isn\'t it?',
      'These accommodations are quite beneath my usual standards.',
      'How charming that the government thinks this will break me.',
      'Prison orange really isn\'t my color, but then again, neither is justice.',
      'I suppose this is what passes for luxury in the federal system.',
      'The food here is simply divine... if you enjoy cardboard.',
      'My cellmate snores like a chainsaw - how utterly pedestrian.',
      'I miss my yacht, but I suppose this is just another island getaway.'
    ]
  },
  'Andy Cohen': {
    color: '#ff9ff3', // Pink
    style: 'dramatic',
    phrases: [
      'Honey, this prison drama is better than any reality show I\'ve produced.',
      'The tea in here is HOT, and I don\'t mean the coffee.',
      'If I had a camera crew, this place would be ratings gold.',
      'These inmates have more plot twists than a Housewives reunion.',
      'I\'m taking mental notes for my next prison documentary pitch.',
      'The gossip in this cell block is absolutely scandalous!',
      'Who needs Bravo when you have this much drama behind bars?',
      'I\'m basically doing field research for my next tell-all book.'
    ]
  },
  '6ix9ine': {
    color: '#ff4757', // Bright red
    style: 'aggressive',
    phrases: [
      'Y\'all think this prison can hold me? Think again, bro!',
      'I\'m still the king even in this concrete jungle!',
      'These bars can\'t stop the hustle, they just slow it down.',
      'I\'ve seen worse places than this, trust me.',
      'The streets made me, prison just polished the edges.',
      'I\'m running things in here, just like I did outside.',
      'This ain\'t my first rodeo, and it won\'t be my last.',
      'They locked me up, but they can\'t lock up the energy!'
    ]
  },
  'Martin': {
    color: '#70a1ff', // Blue
    style: 'arrogant',
    phrases: [
      'I\'m the smartest person in this entire facility, and I can prove it.',
      'These guards couldn\'t pass a basic economics exam if their lives depended on it.',
      'Prison is just another market inefficiency I\'ll exploit.',
      'I\'ve read more books in here than most people read in a lifetime.',
      'The pharmaceutical industry is more corrupt than this prison system.',
      'I\'m using this time to develop my next billion-dollar idea.',
      'These inmates don\'t understand the value of intellectual property.',
      'I could run this prison better than the current administration.'
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
