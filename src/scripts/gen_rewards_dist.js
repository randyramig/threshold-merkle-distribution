// Script that generates a new Merkle Distribution for rewards and outputs the
// data to JSON files
// Use: node src/scripts/gen_merkle_dist.js

require("dotenv").config()
const fs = require("fs")
const shell = require("shelljs")
const Subgraph = require("./pre-rewards/subgraph.js")
const Rewards = require("./pre-rewards/rewards.js")
const MerkleDist = require("./merkle_dist/merkle_dist.js")

// The following parameters must be modified for each distribution
const bonusWeight = 0.0
const preWeight = 0.25
const tbtcv2Weight = 0.75
const startTime = new Date("2023-08-01T00:00:00+00:00").getTime() / 1000
const endTime = new Date("2023-09-01T00:00:00+00:00").getTime() / 1000
const lastDistribution = "2023-08-01"

const etherscanApiKey = process.env.ETHERSCAN_TOKEN
const subgraphApiKey = process.env.SUBGRAPH_API_KEY
const tbtcv2ScriptPath = "src/scripts/tbtcv2-rewards/"
const subgraphId = "8iv4pFv7UL3vMjYeetmFCKD9Mg2V4d1S2rapQXo8fRq5"
const graphqlApi = `https://gateway.thegraph.com/api/${subgraphApiKey}/subgraphs/id/${subgraphId}`

async function main() {
  if (!subgraphApiKey) {
    console.error("Error: no SUBGRAPH_API_KEY in environment variables")
    return
  }
  if (!etherscanApiKey) {
    console.error("Error: no ETHERSCAN_TOKEN in environment variables")
    return
  }

  let earnedBonusRewards = {}
  let earnedPreRewards = {}
  let earnedTbtcv2Rewards = {}
  let bonusRewards = {}
  let preRewards = {}
  let tbtcv2Rewards = {}
  const endDate = new Date(endTime * 1000).toISOString().slice(0, 10)
  const distPath = `distributions/${endDate}`
  const distributionsFilePath = "distributions/distributions.json"
  const tbtcv2RewardsDetailsPath = `${distPath}/tBTCv2-rewards-details/`
  const lastDistPath = `distributions/${lastDistribution}`
  const tbtcv2Script =
    "./rewards.sh " +
    `--rewards-start-date ${startTime} ` +
    `--rewards-end-date ${endTime} ` +
    `--etherscan-token ${etherscanApiKey} ` +
    `--rewards-details-path ../../../${tbtcv2RewardsDetailsPath}`

  try {
    fs.mkdirSync(distPath)
    fs.mkdirSync(tbtcv2RewardsDetailsPath)
  } catch (err) {
    console.error(err)
    return
  }

  // Bonus rewards calculation
  if (bonusWeight > 0) {
    console.log("Calculating bonus rewards...")
    const bonusStakes = await Subgraph.getBonusStakes(graphqlApi)
    earnedBonusRewards = Rewards.calculateBonusRewards(bonusStakes, bonusWeight)
  }

  // PRE rewards calculation
  if (preWeight > 0) {
    console.log("Calculating PRE rewards...")
    const preStakes = await Subgraph.getPreStakes(
      graphqlApi,
      startTime,
      endTime
    )
    earnedPreRewards = await Rewards.calculatePreRewards(preStakes, preWeight)
  }

  // tBTCv2 rewards calculation
  if (tbtcv2Weight > 0) {
    console.log("Calculating tBTCv2 rewards...")
    shell.exec(`cd ${tbtcv2ScriptPath} && ${tbtcv2Script}`)
    const tbtcv2RewardsRaw = JSON.parse(
      fs.readFileSync("./src/scripts/tbtcv2-rewards/rewards.json")
    )
    earnedTbtcv2Rewards = Rewards.calculateTbtcv2Rewards(
      tbtcv2RewardsRaw,
      tbtcv2Weight
    )
  }

  // Add rewards earned to cumulative totals
  try {
    bonusRewards = JSON.parse(
      fs.readFileSync(`${lastDistPath}/MerkleInputBonusRewards.json`)
    )
    bonusRewards = MerkleDist.combineMerkleInputs(
      bonusRewards,
      earnedBonusRewards
    )
    fs.writeFileSync(
      distPath + "/MerkleInputBonusRewards.json",
      JSON.stringify(bonusRewards, null, 4)
    )
    preRewards = JSON.parse(
      fs.readFileSync(`${lastDistPath}/MerkleInputPreRewards.json`)
    )
    preRewards = MerkleDist.combineMerkleInputs(preRewards, earnedPreRewards)
    fs.writeFileSync(
      distPath + "/MerkleInputPreRewards.json",
      JSON.stringify(preRewards, null, 4)
    )
    if (fs.existsSync(`${lastDistPath}/MerkleInputTbtcv2Rewards.json`)) {
      tbtcv2Rewards = JSON.parse(
        fs.readFileSync(`${lastDistPath}/MerkleInputTbtcv2Rewards.json`)
      )
    } else {
      tbtcv2Rewards = {}
    }
    tbtcv2Rewards = MerkleDist.combineMerkleInputs(
      tbtcv2Rewards,
      earnedTbtcv2Rewards
    )
    fs.writeFileSync(
      distPath + "/MerkleInputTbtcv2Rewards.json",
      JSON.stringify(tbtcv2Rewards, null, 4)
    )
  } catch (err) {
    console.error(err)
    return
  }

  let merkleInput = MerkleDist.combineMerkleInputs(bonusRewards, preRewards)
  merkleInput = MerkleDist.combineMerkleInputs(merkleInput, tbtcv2Rewards)

  // Generate the Merkle distribution
  const merkleDist = MerkleDist.genMerkleDist(merkleInput)

  // Write the Merkle distribution to JSON file
  try {
    fs.writeFileSync(
      distPath + "/MerkleInputTotalRewards.json",
      JSON.stringify(merkleInput, null, 4)
    )
    fs.writeFileSync(
      distPath + "/MerkleDist.json",
      JSON.stringify(merkleDist, null, 4)
    )
  } catch (err) {
    console.error(err)
    return
  }

  // Write the total amount in distributions JSON file
  const distributions = JSON.parse(fs.readFileSync(distributionsFilePath))
  distributions.LatestCumulativeAmount = merkleDist.totalAmount
  distributions.CumulativeAmountByDistribution[endDate] = merkleDist.totalAmount
  fs.writeFileSync(
    distributionsFilePath,
    JSON.stringify(distributions, null, 4)
  )

  console.log("Total accumulated amount of rewards: ", merkleDist.totalAmount)
}

;(async () => {
  await main()
})()
