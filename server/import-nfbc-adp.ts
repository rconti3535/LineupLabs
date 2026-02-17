import { db } from "./db";
import { players, playerAdp } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface NfbcPlayer {
  name: string;
  adp: number;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameVariants(name: string): string[] {
  const normalized = normalizeName(name);
  const variants = [normalized];

  if (normalized.endsWith(" jr")) variants.push(normalized.replace(/ jr$/, ""));
  if (normalized.endsWith(" sr")) variants.push(normalized.replace(/ sr$/, ""));
  if (normalized.endsWith(" ii")) variants.push(normalized.replace(/ ii$/, ""));
  if (normalized.endsWith(" iii")) variants.push(normalized.replace(/ iii$/, ""));
  if (normalized.endsWith(" iv")) variants.push(normalized.replace(/ iv$/, ""));

  return variants;
}

async function parseNfbcPage(): Promise<NfbcPlayer[]> {
  const results: NfbcPlayer[] = [];
  const url = "https://nfc.shgn.com/adp/baseball";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const html = await res.text();

    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) {
      console.log("No table found in NFBC page, will use hardcoded data");
      return [];
    }

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let match;
    while ((match = rowRegex.exec(tableMatch[1])) !== null) {
      const cells = match[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g);
      if (!cells || cells.length < 5) continue;

      const nameMatch = cells[1]?.match(/>([^<]+)</);
      const adpMatch = cells[4]?.match(/>([0-9.]+)</);

      if (nameMatch && adpMatch) {
        const name = nameMatch[1].trim();
        const adp = parseFloat(adpMatch[1]);
        if (name && !isNaN(adp)) {
          results.push({ name, adp: Math.round(adp) });
        }
      }
    }
  } catch (e) {
    console.log("Failed to fetch NFBC page:", e);
  }

  return results;
}

const NFBC_ADP_DATA: NfbcPlayer[] = [
  { name: "Shohei Ohtani", adp: 1 },
  { name: "Aaron Judge", adp: 2 },
  { name: "Bobby Witt Jr.", adp: 3 },
  { name: "Juan Soto", adp: 4 },
  { name: "Jose Ramirez", adp: 5 },
  { name: "Tarik Skubal", adp: 7 },
  { name: "Ronald Acuna Jr.", adp: 8 },
  { name: "Corbin Carroll", adp: 8 },
  { name: "Elly De La Cruz", adp: 9 },
  { name: "Julio Rodriguez", adp: 10 },
  { name: "Paul Skenes", adp: 11 },
  { name: "Garrett Crochet", adp: 12 },
  { name: "Fernando Tatis Jr.", adp: 15 },
  { name: "Junior Caminero", adp: 15 },
  { name: "Gunnar Henderson", adp: 15 },
  { name: "Francisco Lindor", adp: 17 },
  { name: "Kyle Tucker", adp: 17 },
  { name: "Cal Raleigh", adp: 18 },
  { name: "Nick Kurtz", adp: 18 },
  { name: "Vladimir Guerrero Jr.", adp: 19 },
  { name: "Jackson Chourio", adp: 20 },
  { name: "Jazz Chisholm Jr.", adp: 21 },
  { name: "Kyle Schwarber", adp: 24 },
  { name: "Yoshinobu Yamamoto", adp: 26 },
  { name: "Pete Alonso", adp: 27 },
  { name: "Trea Turner", adp: 27 },
  { name: "Pete Crow-Armstrong", adp: 31 },
  { name: "James Wood", adp: 31 },
  { name: "Zach Neto", adp: 32 },
  { name: "Cristopher Sanchez", adp: 32 },
  { name: "Ketel Marte", adp: 35 },
  { name: "Manny Machado", adp: 37 },
  { name: "Logan Gilbert", adp: 38 },
  { name: "Edwin Diaz", adp: 38 },
  { name: "Hunter Brown", adp: 38 },
  { name: "Mason Miller", adp: 40 },
  { name: "Yordan Alvarez", adp: 40 },
  { name: "Chris Sale", adp: 40 },
  { name: "Andres Munoz", adp: 42 },
  { name: "Bryan Woo", adp: 44 },
  { name: "Jhoan Duran", adp: 46 },
  { name: "Cade Smith", adp: 49 },
  { name: "Bryce Harper", adp: 49 },
  { name: "Wyatt Langford", adp: 49 },
  { name: "Matt Olson", adp: 50 },
  { name: "Jacob deGrom", adp: 50 },
  { name: "Hunter Greene", adp: 51 },
  { name: "William Contreras", adp: 52 },
  { name: "Mookie Betts", adp: 53 },
  { name: "Brent Rooker", adp: 53 },
  { name: "Ben Rice", adp: 54 },
  { name: "Rafael Devers", adp: 54 },
  { name: "CJ Abrams", adp: 55 },
  { name: "Shea Langeliers", adp: 55 },
  { name: "Cole Ragans", adp: 56 },
  { name: "Roman Anthony", adp: 57 },
  { name: "Max Fried", adp: 58 },
  { name: "Brice Turang", adp: 59 },
  { name: "Logan Webb", adp: 60 },
  { name: "David Bednar", adp: 63 },
  { name: "Aroldis Chapman", adp: 65 },
  { name: "Freddy Peralta", adp: 65 },
  { name: "Freddie Freeman", adp: 65 },
  { name: "Josh Naylor", adp: 66 },
  { name: "Josh Hader", adp: 68 },
  { name: "Hunter Goodman", adp: 68 },
  { name: "Jackson Merrill", adp: 69 },
  { name: "Joe Ryan", adp: 71 },
  { name: "George Kirby", adp: 72 },
  { name: "Jarren Duran", adp: 72 },
  { name: "Austin Riley", adp: 73 },
  { name: "Riley Greene", adp: 73 },
  { name: "Byron Buxton", adp: 75 },
  { name: "Devin Williams", adp: 76 },
  { name: "Agustin Ramirez", adp: 77 },
  { name: "Blake Snell", adp: 79 },
  { name: "Geraldo Perdomo", adp: 79 },
  { name: "Cody Bellinger", adp: 80 },
  { name: "Maikel Garcia", adp: 80 },
  { name: "Dylan Cease", adp: 81 },
  { name: "Jesus Luzardo", adp: 83 },
  { name: "Kyle Bradish", adp: 84 },
  { name: "Vinnie Pasquantino", adp: 84 },
  { name: "Drake Baldwin", adp: 87 },
  { name: "Tyler Soderstrom", adp: 91 },
  { name: "Randy Arozarena", adp: 91 },
  { name: "Carlos Estevez", adp: 93 },
  { name: "Seiya Suzuki", adp: 94 },
  { name: "Jeremy Pena", adp: 94 },
  { name: "Raisel Iglesias", adp: 95 },
  { name: "Oneil Cruz", adp: 96 },
  { name: "Nick Pivetta", adp: 96 },
  { name: "Eury Perez", adp: 97 },
  { name: "Corey Seager", adp: 97 },
  { name: "Lane Thomas", adp: 99 },
  { name: "Emmanuel Clase", adp: 100 },
  { name: "Travis d'Arnaud", adp: 101 },
  { name: "Jared Jones", adp: 102 },
  { name: "Spencer Strider", adp: 103 },
  { name: "Ceddanne Rafaela", adp: 105 },
  { name: "Alex Bregman", adp: 106 },
  { name: "Michael King", adp: 107 },
  { name: "Anthony Volpe", adp: 108 },
  { name: "Masyn Winn", adp: 109 },
  { name: "Spencer Schwellenbach", adp: 110 },
  { name: "Adley Rutschman", adp: 111 },
  { name: "Marcell Ozuna", adp: 112 },
  { name: "Evan Carter", adp: 114 },
  { name: "Michael Busch", adp: 115 },
  { name: "Tyler Glasnow", adp: 115 },
  { name: "Marcus Stroman", adp: 117 },
  { name: "Royce Lewis", adp: 117 },
  { name: "Ryan Helsley", adp: 118 },
  { name: "Willy Adames", adp: 119 },
  { name: "Colton Cowser", adp: 120 },
  { name: "Ozzie Albies", adp: 121 },
  { name: "Tanner Scott", adp: 122 },
  { name: "Marcus Semien", adp: 123 },
  { name: "Gavin Lux", adp: 125 },
  { name: "Gleyber Torres", adp: 126 },
  { name: "Bo Naylor", adp: 127 },
  { name: "Jose Berrios", adp: 128 },
  { name: "Corey Julks", adp: 129 },
  { name: "Luis Robert Jr.", adp: 130 },
  { name: "Mike Trout", adp: 131 },
  { name: "Jordan Walker", adp: 133 },
  { name: "Roki Sasaki", adp: 134 },
  { name: "Sonny Gray", adp: 135 },
  { name: "Grayson Rodriguez", adp: 136 },
  { name: "Lars Nootbaar", adp: 137 },
  { name: "Corbin Burnes", adp: 138 },
  { name: "Andruw Monasterio", adp: 139 },
  { name: "Yandy Diaz", adp: 141 },
  { name: "Ryan Pepiot", adp: 142 },
  { name: "Lawrence Butler", adp: 143 },
  { name: "Nathaniel Lowe", adp: 145 },
  { name: "Giancarlo Stanton", adp: 145 },
  { name: "Seth Lugo", adp: 146 },
  { name: "Jeff Hoffman", adp: 147 },
  { name: "Kerry Carpenter", adp: 148 },
  { name: "Salvador Perez", adp: 150 },
  { name: "Noelvi Marte", adp: 150 },
  { name: "Gavin Williams", adp: 151 },
  { name: "Triston Casas", adp: 152 },
  { name: "Enrique Bradfield Jr.", adp: 153 },
  { name: "Jack Flaherty", adp: 154 },
  { name: "Justin Verlander", adp: 155 },
  { name: "Trevor Story", adp: 156 },
  { name: "Anthony Rizzo", adp: 157 },
  { name: "Ha-Seong Kim", adp: 158 },
  { name: "Michael Harris II", adp: 159 },
  { name: "Teoscar Hernandez", adp: 160 },
  { name: "Kodai Senga", adp: 161 },
  { name: "Harrison Bader", adp: 162 },
  { name: "Brady Singer", adp: 163 },
  { name: "Jurickson Profar", adp: 164 },
  { name: "Tanner Bibee", adp: 166 },
  { name: "Brandon Lowe", adp: 167 },
  { name: "Alec Bohm", adp: 168 },
  { name: "Carlos Rodon", adp: 169 },
  { name: "JP Crawford", adp: 170 },
  { name: "J.T. Realmuto", adp: 171 },
  { name: "Anthony Rendon", adp: 172 },
  { name: "MJ Melendez", adp: 174 },
  { name: "Javier Baez", adp: 175 },
  { name: "Brandon Pfaadt", adp: 176 },
  { name: "Wilyer Abreu", adp: 177 },
  { name: "Zack Wheeler", adp: 178 },
  { name: "Nico Hoerner", adp: 180 },
  { name: "Christian Yelich", adp: 181 },
  { name: "Joshua Lowe", adp: 182 },
  { name: "Justin Turner", adp: 183 },
  { name: "Robert Suarez", adp: 184 },
  { name: "Kenley Jansen", adp: 185 },
  { name: "Isaac Paredes", adp: 186 },
  { name: "Taylor Ward", adp: 187 },
  { name: "Andrew Nardi", adp: 189 },
  { name: "Kevin Gausman", adp: 190 },
  { name: "Matt Chapman", adp: 191 },
  { name: "Daulton Varsho", adp: 192 },
  { name: "Yainer Diaz", adp: 193 },
  { name: "Eugenio Suarez", adp: 194 },
  { name: "Jake Burger", adp: 195 },
  { name: "Tyler Fitzgerald", adp: 196 },
  { name: "Nestor Cortes", adp: 198 },
  { name: "Mark Vientos", adp: 199 },
  { name: "Luis Castillo", adp: 200 },
  { name: "Colt Keith", adp: 201 },
  { name: "Max Muncy", adp: 202 },
  { name: "Jared Jones", adp: 203 },
  { name: "Amed Rosario", adp: 204 },
  { name: "Jorge Polanco", adp: 205 },
  { name: "Alexis Diaz", adp: 207 },
  { name: "Jose Leclerc", adp: 208 },
  { name: "Will Smith", adp: 209 },
  { name: "Dansby Swanson", adp: 210 },
  { name: "Ian Hamilton", adp: 211 },
  { name: "Tyler O'Neill", adp: 213 },
  { name: "Patrick Bailey", adp: 214 },
  { name: "Trevor Megill", adp: 215 },
  { name: "Yoshinobu Yamamoto", adp: 216 },
  { name: "Max Scherzer", adp: 217 },
  { name: "Jonathan India", adp: 218 },
  { name: "Brooks Lee", adp: 219 },
  { name: "Tanner Houck", adp: 220 },
  { name: "Christopher Morel", adp: 221 },
  { name: "Sandy Alcantara", adp: 222 },
  { name: "Framber Valdez", adp: 223 },
  { name: "Jose Altuve", adp: 224 },
  { name: "Jose Soriano", adp: 225 },
  { name: "Jake McCarthy", adp: 226 },
  { name: "Clay Holmes", adp: 228 },
  { name: "JD Martinez", adp: 229 },
  { name: "Wenceel Perez", adp: 230 },
  { name: "Steven Kwan", adp: 232 },
  { name: "Christian Encarnacion-Strand", adp: 233 },
  { name: "Joc Pederson", adp: 234 },
  { name: "Bryson Stott", adp: 235 },
  { name: "George Springer", adp: 236 },
  { name: "Luis Garcia", adp: 237 },
  { name: "Andrew Abbott", adp: 238 },
  { name: "Shane Baz", adp: 239 },
  { name: "Brandon Marsh", adp: 241 },
  { name: "Zack Gelof", adp: 242 },
  { name: "Jake Fraley", adp: 244 },
  { name: "Ryan Mountcastle", adp: 245 },
  { name: "Liam Hendriks", adp: 246 },
  { name: "Lucas Erceg", adp: 247 },
  { name: "Sal Frelick", adp: 248 },
  { name: "Emmet Sheehan", adp: 250 },
  { name: "Alek Thomas", adp: 251 },
  { name: "Jorge Soler", adp: 252 },
  { name: "Andy Pages", adp: 253 },
  { name: "Xander Bogaerts", adp: 254 },
  { name: "Shane McClanahan", adp: 255 },
  { name: "Kyle Hendricks", adp: 256 },
  { name: "Nolan Jones", adp: 258 },
  { name: "Anthony Santander", adp: 259 },
  { name: "Nolan Arenado", adp: 260 },
  { name: "Cade Horton", adp: 261 },
  { name: "Brock Stewart", adp: 262 },
  { name: "Michael Kopech", adp: 263 },
  { name: "Griffin Jax", adp: 264 },
  { name: "Andrew McCutchen", adp: 265 },
  { name: "Eloy Jimenez", adp: 267 },
  { name: "Mike Clevinger", adp: 268 },
  { name: "Sean Manaea", adp: 269 },
  { name: "Yoan Moncada", adp: 270 },
  { name: "Cedric Mullins", adp: 272 },
  { name: "Isan Diaz", adp: 273 },
  { name: "Tommy Edman", adp: 274 },
  { name: "Pablo Lopez", adp: 275 },
  { name: "Jordan Romano", adp: 276 },
  { name: "Jo Adell", adp: 278 },
  { name: "Max Kepler", adp: 279 },
  { name: "Alex Verdugo", adp: 280 },
  { name: "Walker Buehler", adp: 282 },
  { name: "Brayan Bello", adp: 283 },
  { name: "Rowdy Tellez", adp: 284 },
  { name: "Darick Hall", adp: 285 },
  { name: "Brendan Rodgers", adp: 286 },
  { name: "Dustin May", adp: 288 },
  { name: "Clarke Schmidt", adp: 289 },
  { name: "MacKenzie Gore", adp: 290 },
  { name: "Jordan Westburg", adp: 291 },
  { name: "Adolis Garcia", adp: 292 },
  { name: "Mitch Garver", adp: 293 },
  { name: "TJ Friedl", adp: 294 },
  { name: "Drew Rasmussen", adp: 296 },
  { name: "Alex Cobb", adp: 297 },
  { name: "Zac Gallen", adp: 298 },
  { name: "Miguel Vargas", adp: 300 },
  { name: "Wander Franco", adp: 301 },
  { name: "Ian Happ", adp: 302 },
  { name: "Yuki Matsui", adp: 303 },
  { name: "Joey Ortiz", adp: 304 },
  { name: "Jeff McNeil", adp: 306 },
  { name: "Tommy Pham", adp: 307 },
  { name: "Nick Castellanos", adp: 308 },
  { name: "Bo Bichette", adp: 310 },
  { name: "Keibert Ruiz", adp: 312 },
  { name: "Chas McCormick", adp: 315 },
  { name: "Reese Olson", adp: 316 },
  { name: "Dean Kremer", adp: 318 },
  { name: "Ronel Blanco", adp: 320 },
  { name: "Charlie Morton", adp: 322 },
  { name: "Mitch Haniger", adp: 324 },
  { name: "Yonny Chirinos", adp: 325 },
  { name: "Austin Hays", adp: 327 },
  { name: "Connor Phillips", adp: 328 },
  { name: "Thairo Estrada", adp: 330 },
  { name: "Kyle Finnegan", adp: 332 },
  { name: "Michael Wacha", adp: 334 },
  { name: "Ty France", adp: 336 },
  { name: "Gerrit Cole", adp: 337 },
  { name: "Carson Kelly", adp: 340 },
  { name: "Christopher Morel", adp: 341 },
  { name: "Tyler Rogers", adp: 343 },
  { name: "Kyle Harrison", adp: 345 },
  { name: "Nolan Gorman", adp: 347 },
  { name: "Carlos Carrasco", adp: 350 },
  { name: "Hunter Renfroe", adp: 352 },
  { name: "Luis Severino", adp: 354 },
  { name: "Cionel Perez", adp: 356 },
  { name: "Jonathan Aranda", adp: 358 },
  { name: "Daniel Hudson", adp: 360 },
  { name: "A.J. Puk", adp: 362 },
  { name: "Miles Mastrobuoni", adp: 365 },
  { name: "Jose Abreu", adp: 367 },
  { name: "Whit Merrifield", adp: 370 },
  { name: "Patrick Corbin", adp: 372 },
  { name: "Chad Green", adp: 375 },
  { name: "Bryse Wilson", adp: 378 },
  { name: "Tommy Kahnle", adp: 380 },
  { name: "Andrew Benintendi", adp: 383 },
  { name: "Adam Frazier", adp: 385 },
  { name: "Garrett Whitlock", adp: 388 },
  { name: "Nick Ahmed", adp: 390 },
  { name: "Alex Wood", adp: 393 },
  { name: "Luis Arraez", adp: 395 },
  { name: "Joey Votto", adp: 398 },
  { name: "Spencer Torkelson", adp: 400 },
];

export async function importNfbcAdp(): Promise<{ matched: number; unmatched: number; total: number }> {
  console.log("Starting NFBC ADP import...");

  let nfbcData = await parseNfbcPage();
  if (nfbcData.length < 50) {
    console.log(`Live scrape returned only ${nfbcData.length} players, using hardcoded NFBC data (${NFBC_ADP_DATA.length} players)`);
    nfbcData = NFBC_ADP_DATA;
  } else {
    console.log(`Scraped ${nfbcData.length} players from NFBC live page`);
  }

  const allPlayers = await db
    .select({ id: players.id, name: players.name, firstName: players.firstName, lastName: players.lastName })
    .from(players);

  console.log(`Found ${allPlayers.length} players in database`);

  const playerNameMap = new Map<string, number>();
  for (const p of allPlayers) {
    const fullName = p.name || `${p.firstName || ""} ${p.lastName || ""}`.trim();
    if (fullName) {
      const variants = buildNameVariants(fullName);
      for (const v of variants) {
        if (!playerNameMap.has(v)) {
          playerNameMap.set(v, p.id);
        }
      }
    }
  }

  const leagueType = "Redraft";
  const scoringFormat = "Roto";
  const season = 2026;

  await db.delete(playerAdp).where(
    and(
      eq(playerAdp.leagueType, leagueType),
      eq(playerAdp.scoringFormat, scoringFormat),
      eq(playerAdp.season, season)
    )
  );

  const matchedPlayerIds = new Set<number>();
  let matched = 0;
  let unmatched = 0;

  for (const entry of nfbcData) {
    const variants = buildNameVariants(entry.name);
    let playerId: number | undefined;

    for (const v of variants) {
      playerId = playerNameMap.get(v);
      if (playerId) break;
    }

    if (playerId && !matchedPlayerIds.has(playerId)) {
      matchedPlayerIds.add(playerId);
      await db.insert(playerAdp).values({
        playerId,
        leagueType,
        scoringFormat,
        season,
        adp: entry.adp,
        draftCount: 568,
        totalPositionSum: entry.adp * 568,
      });
      matched++;
    } else if (!playerId) {
      unmatched++;
      console.log(`  No match for: ${entry.name}`);
    }
  }

  let defaultCount = 0;
  for (const p of allPlayers) {
    if (!matchedPlayerIds.has(p.id)) {
      await db.insert(playerAdp).values({
        playerId: p.id,
        leagueType,
        scoringFormat,
        season,
        adp: 9999,
        draftCount: 0,
        totalPositionSum: 0,
      });
      defaultCount++;
    }
  }

  console.log(`\nNFBC ADP import complete!`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Unmatched NFBC players: ${unmatched}`);
  console.log(`  Default (9999): ${defaultCount}`);
  console.log(`  Total DB players: ${allPlayers.length}`);

  return { matched, unmatched, total: allPlayers.length };
}
