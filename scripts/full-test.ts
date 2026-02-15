const BASE = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} => ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log("=== FULL APP TEST ===\n");

  // 1. Create commissioner user
  console.log("1. Creating commissioner user...");
  let commish: any;
  try {
    commish = await api("POST", "/api/users", {
      username: "TestCommish",
      email: "commish@test.com",
      password: "password123",
      name: "Test Commissioner",
    });
  } catch {
    commish = await api("POST", "/api/auth/login", { username: "TestCommish", password: "password123" });
  }
  console.log(`   Commissioner: id=${commish.id}, username=${commish.username}`);

  // 2. Create a public league with 6 teams (smaller for faster test)
  console.log("\n2. Creating public league (6 teams)...");
  const league = await api("POST", "/api/leagues", {
    name: "Test Season League 2026",
    description: "Full simulation test league",
    type: "Redraft",
    numberOfTeams: 6,
    scoringFormat: "Roto",
    hittingCategories: ["R", "HR", "RBI", "SB", "AVG"],
    pitchingCategories: ["W", "SV", "K", "ERA", "WHIP"],
    isPublic: true,
    maxTeams: 6,
    buyin: "Free",
    prize: "Trophy",
    rosterPositions: ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "P", "BN", "BN", "IL"],
    draftType: "Snake",
    secondsPerPick: 30,
    draftOrder: "Random",
    createdBy: commish.id,
  });
  console.log(`   League created: id=${league.id}, name="${league.name}"`);

  // 3. Verify league shows in public listings
  console.log("\n3. Verifying league appears in public listings...");
  const publicLeagues = await api("GET", "/api/leagues/public");
  const found = publicLeagues.find((l: any) => l.id === league.id);
  console.log(`   Found in public: ${found ? "YES" : "NO"} (${publicLeagues.length} total public leagues)`);

  // 4. Start draft with CPU fill
  console.log("\n4. Starting draft with CPU teams...");
  const draftStart = await api("POST", `/api/leagues/${league.id}/draft-control`, {
    userId: commish.id,
    action: "start",
    fillWithCpu: true,
  });
  console.log(`   Draft status: ${draftStart.draftStatus}`);

  // Verify teams
  const teams = await api("GET", `/api/teams/league/${league.id}`);
  console.log(`   Teams in league: ${teams.length}`);
  for (const t of teams) {
    console.log(`     - ${t.name} (id=${t.id}, cpu=${t.isCpu || false})`);
  }

  // 5. Run the entire draft via auto-pick
  const rosterSize = league.rosterPositions.length;
  const totalPicks = rosterSize * teams.length;
  console.log(`\n5. Running snake draft: ${totalPicks} total picks (${rosterSize} rounds x ${teams.length} teams)...`);

  let actualPicks = 0;
  for (let pick = 1; pick <= totalPicks; pick++) {
    try {
      const result = await api("POST", `/api/leagues/${league.id}/auto-pick`);
      actualPicks++;
      if (pick % 18 === 0 || pick <= 6 || pick === totalPicks) {
        console.log(`   Pick ${pick}/${totalPicks}: ${result.player.name} (${result.player.position}) -> Team ${result.pick.teamId}`);
      }
    } catch (e: any) {
      if (e.message.includes("not active") || e.message.includes("complete")) {
        console.log(`   Draft ended after ${actualPicks} picks`);
        break;
      }
      throw e;
    }
  }

  // 6. Verify draft completion
  console.log("\n6. Verifying draft completion...");
  const leagueAfterDraft = await api("GET", `/api/leagues/${league.id}`);
  console.log(`   Draft status: ${leagueAfterDraft.draftStatus}`);

  const draftPicks = await api("GET", `/api/leagues/${league.id}/draft-picks`);
  console.log(`   Total picks recorded: ${draftPicks.length}`);

  // 7. Init roster slots for commissioner's team
  console.log("\n7. Initializing roster slots for commissioner's team...");
  await api("POST", `/api/leagues/${league.id}/init-roster-slots`, { userId: commish.id });
  console.log("   Roster slots initialized.");

  // Also init for CPU teams
  for (const t of teams) {
    if (t.isCpu && t.userId) {
      try {
        await api("POST", `/api/leagues/${league.id}/init-roster-slots`, { userId: t.userId });
      } catch {}
    }
  }

  // 8. Check standings
  console.log("\n8. Checking Roto standings...");
  const standingsData = await api("GET", `/api/leagues/${league.id}/standings`);
  console.log(`   ${standingsData.standings.length} teams in standings:`);
  for (const s of standingsData.standings.slice(0, 6)) {
    console.log(`     ${s.rank}. ${s.teamName} - ${s.totalPoints} pts`);
  }

  // 9. Check commissioner's roster
  console.log("\n9. Reviewing commissioner's roster...");
  const commishTeam = teams.find((t: any) => t.userId === commish.id);
  const allPicks = await api("GET", `/api/leagues/${league.id}/draft-picks`);
  const myPicks = allPicks.filter((p: any) => p.teamId === commishTeam.id);
  console.log(`   Commissioner team: ${commishTeam.name} (id=${commishTeam.id})`);
  console.log(`   Players on roster: ${myPicks.length}`);

  const rosterPositions = league.rosterPositions;
  const rosterPlayers: any[] = [];
  for (const pick of myPicks) {
    const player = await api("GET", `/api/players/${pick.playerId}`);
    rosterPlayers.push({ pick, player });
    const slotName = pick.rosterSlot !== null ? rosterPositions[pick.rosterSlot] : "?";
    console.log(`     [${slotName}] ${player.name} (${player.position} - ${player.teamAbbreviation || player.team})`);
  }

  // 10. Simulate season - randomly injure starting lineup players and do add/drops
  console.log("\n10. Simulating 2026 season with injuries and add/drops...\n");
  
  const MONTHS = ["April", "May", "June", "July", "August", "September"];
  let totalInjuries = 0;
  let totalAddDrops = 0;
  let totalWaiverClaims = 0;

  for (const month of MONTHS) {
    console.log(`--- ${month} 2026 ---`);

    // Refresh roster state
    const currentPicks = await api("GET", `/api/leagues/${league.id}/draft-picks`);
    const teamPicks = currentPicks.filter((p: any) => p.teamId === commishTeam.id);
    
    // Get starting lineup players (non-BN, non-IL slots)
    const startingPicks = teamPicks.filter((p: any) => {
      if (p.rosterSlot === null) return false;
      const slot = rosterPositions[p.rosterSlot];
      return slot !== "BN" && slot !== "IL";
    });

    if (startingPicks.length === 0) {
      console.log("   No starting players found, skipping...");
      continue;
    }

    // Simulate 1-2 injuries per month
    const injuryCount = Math.random() > 0.5 ? 2 : 1;
    
    for (let inj = 0; inj < injuryCount; inj++) {
      const injuredPick = startingPicks[Math.floor(Math.random() * startingPicks.length)];
      const injuredPlayer = await api("GET", `/api/players/${injuredPick.playerId}`);
      
      const injuredSlot = rosterPositions[injuredPick.rosterSlot];
      console.log(`   INJURY: ${injuredPlayer.name} (${injuredPlayer.position}, slot ${injuredSlot}) goes to IL`);
      totalInjuries++;

      // Try to find an IL slot to move injured player to
      const ilSlotIndex = rosterPositions.findIndex((s: string, i: number) => {
        if (s !== "IL") return false;
        return !teamPicks.some((p: any) => p.rosterSlot === i);
      });

      if (ilSlotIndex !== -1) {
        // Swap injured player to IL
        try {
          await api("POST", `/api/leagues/${league.id}/roster-swap`, {
            userId: commish.id,
            pickIdA: injuredPick.id,
            slotA: injuredPick.rosterSlot,
            pickIdB: null,
            slotB: ilSlotIndex,
          });
          console.log(`   Moved ${injuredPlayer.name} to IL slot ${ilSlotIndex}`);
        } catch (e: any) {
          console.log(`   Could not move to IL: ${e.message}`);
        }
      }

      // Now try to add a replacement player from free agency
      const isPitcher = ["SP", "RP"].includes(injuredPlayer.position);
      const playerType = isPitcher ? "pitchers" : "batters";
      
      const available = await api("GET", `/api/leagues/${league.id}/available-players?type=${playerType}&limit=5&status=free_agents`);
      
      if (available.players && available.players.length > 0) {
        const replacement = available.players[0];
        
        // Check if roster is full - if so, need to drop someone
        const refreshedPicks = await api("GET", `/api/leagues/${league.id}/draft-picks`);
        const refreshedTeamPicks = refreshedPicks.filter((p: any) => p.teamId === commishTeam.id);
        
        if (refreshedTeamPicks.length >= rosterPositions.length) {
          // Roster full — find a bench player to drop and add-drop
          const benchPicks = refreshedTeamPicks.filter((p: any) => {
            if (p.rosterSlot === null) return false;
            return rosterPositions[p.rosterSlot] === "BN";
          });

          if (benchPicks.length > 0) {
            const dropPick = benchPicks[0];
            const dropPlayer = await api("GET", `/api/players/${dropPick.playerId}`);
            
            // Check if the replacement is on waivers
            try {
              const result = await api("POST", `/api/leagues/${league.id}/add-drop`, {
                userId: commish.id,
                addPlayerId: replacement.id,
                dropPickId: dropPick.id,
              });
              console.log(`   ADD/DROP: Added ${replacement.name} (${replacement.position}), Dropped ${dropPlayer.name} (${dropPlayer.position}) -> enters waivers`);
              totalAddDrops++;
            } catch (e: any) {
              // Player might be on waivers, try waiver claim
              if (e.message.includes("waivers")) {
                try {
                  await api("POST", `/api/leagues/${league.id}/waiver-claim`, {
                    userId: commish.id,
                    playerId: replacement.id,
                    dropPickId: dropPick.id,
                  });
                  console.log(`   WAIVER CLAIM: Claimed ${replacement.name} (on waivers), would drop ${dropPlayer.name}`);
                  totalWaiverClaims++;
                } catch (wErr: any) {
                  console.log(`   Could not claim: ${wErr.message}`);
                }
              } else {
                console.log(`   Add/drop failed: ${e.message}`);
              }
            }
          } else {
            console.log(`   No bench players to drop for replacement`);
          }
        } else {
          // Roster has open slot, just add
          try {
            await api("POST", `/api/leagues/${league.id}/add-player`, {
              userId: commish.id,
              playerId: replacement.id,
            });
            console.log(`   ADDED: ${replacement.name} (${replacement.position}) to open roster slot`);
            totalAddDrops++;
          } catch (e: any) {
            console.log(`   Could not add: ${e.message}`);
          }
        }
      } else {
        console.log(`   No available ${playerType} found for replacement`);
      }
    }

    // Check active waivers
    try {
      const waivers = await api("GET", `/api/leagues/${league.id}/waivers`);
      if (waivers.length > 0) {
        console.log(`   Active waivers: ${waivers.length} players on waivers`);
      }
    } catch {}

    // Check pending claims
    try {
      const claims = await api("GET", `/api/leagues/${league.id}/my-claims?userId=${commish.id}`);
      if (claims.length > 0) {
        console.log(`   Pending claims: ${claims.length}`);
        // Cancel one claim to test cancel functionality
        if (claims.length > 1) {
          const cancelClaim = claims[claims.length - 1];
          await api("DELETE", `/api/leagues/${league.id}/waiver-claim/${cancelClaim.id}?userId=${commish.id}`);
          console.log(`   Cancelled claim on ${cancelClaim.player?.name || "unknown"}`);
        }
      }
    } catch {}

    console.log("");
  }

  // 11. Final standings
  console.log("11. Final standings after season simulation...");
  const finalStandings = await api("GET", `/api/leagues/${league.id}/standings`);
  console.log("");
  for (const s of finalStandings.standings) {
    console.log(`   ${s.rank}. ${s.teamName} - ${s.totalPoints} pts`);
    const cats = Object.entries(s.categoryValues || {}).map(([k, v]) => `${k}:${v}`).join(", ");
    if (cats) console.log(`      Categories: ${cats}`);
  }

  // 12. Final roster review
  console.log("\n12. Final commissioner roster...");
  const finalPicks = await api("GET", `/api/leagues/${league.id}/draft-picks`);
  const finalTeamPicks = finalPicks.filter((p: any) => p.teamId === commishTeam.id);
  for (const pick of finalTeamPicks) {
    const player = await api("GET", `/api/players/${pick.playerId}`);
    const slotName = pick.rosterSlot !== null ? rosterPositions[pick.rosterSlot] : "?";
    console.log(`   [${slotName}] ${player.name} (${player.position})`);
  }

  // 13. Summary
  console.log("\n=== TEST SUMMARY ===");
  console.log(`League: ${league.name} (id=${league.id})`);
  console.log(`Teams: ${teams.length}`);
  console.log(`Draft picks: ${draftPicks.length}`);
  console.log(`Injuries simulated: ${totalInjuries}`);
  console.log(`Add/Drops completed: ${totalAddDrops}`);
  console.log(`Waiver claims submitted: ${totalWaiverClaims}`);
  console.log(`Final roster size: ${finalTeamPicks.length}`);
  console.log("\n=== TEST COMPLETE ===");
}

run().catch(e => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
