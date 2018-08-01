const rp = require("request-promise")
const moment = require("moment")
const momentDurationFormatSetup = require("moment-duration-format")
const _cliProgress = require("cli-progress")

const STRAVA_TOKEN = "STRAVA_ACCESS_TOKEN"
const STRAVA_BASE_URL = "https://www.strava.com/api/v3"

const sumArray = (accumulator, currentValue) => accumulator + currentValue

const activitiesBar = new _cliProgress.Bar({
	format: "{bar} {percentage}% | ETA: {eta}s | {value}/{total} pages parsed"
}, _cliProgress.Presets.shades_classic);
const zonesBar = new _cliProgress.Bar({
	format: "{bar} {percentage}% | ETA: {eta}s | {value}/{total} activities downloaded"
}, _cliProgress.Presets.shades_classic);

const rpOptions = {
	uri: STRAVA_BASE_URL,
	qs: {
		access_token: STRAVA_TOKEN
	},
	json: true
}

let stravaRequestCount = 0

async function getLoggedInUserId() {
	let options = Object.assign({}, rpOptions)
	options.uri = options.uri + "/athlete"
	let athleteId = -1
	await rp(options).then(function (response) {
		athleteId = response.id
		stravaRequestCount++
	})
	return athleteId
}

async function getLoggedInUserActivityCount() {
	let options = Object.assign({}, rpOptions)
	let athleteId = await getLoggedInUserId()

	options.uri = options.uri + "/athletes/" + athleteId + "/stats"
	let activitiesTotal = 0

	await rp(options).then(function (response) {
		stravaRequestCount++
		activitiesTotal = response.all_ride_totals.count + response.all_run_totals.count + response.all_swim_totals.count
	})
	return activitiesTotal
}

async function getActivities() {
	let activitiesPromises = []
	let activities = []
	let perPage = 30
	let totalActivityCount = await getLoggedInUserActivityCount()
	let numberOfPages = Math.ceil(totalActivityCount / perPage)

	activitiesBar.start(numberOfPages, 0)
	for (i = 0; i < numberOfPages; i++) {
		let options = Object.assign({}, rpOptions)
		options.uri = options.uri + "/athlete/activities"
		options.qs.per_page = perPage
		options.qs.page = i + 1

		activitiesPromises.push(rp(options).then(function (response) {
			for (id in response) {
				activities.push(response[id].id)
			}
			stravaRequestCount++
			activitiesBar.increment()
		}))
	}
	await Promise.all(activitiesPromises)
	activitiesBar.stop()
	return activities
}

async function calculateTimeInZones(activityIds) {
	let zones = []
	let heartZonePromises = []

	zonesBar.start(activityIds.length, 0)
	for (id in activityIds) {
		let options = Object.assign({}, rpOptions)
		options.uri = options.uri + "/activities/" + activityIds[id] + "/zones"

		heartZonePromises.push(rp(options).then(function (response) {
			zones.push(response[0].distribution_buckets)
			stravaRequestCount++
			zonesBar.increment();
		}))
	}
	await Promise.all(heartZonePromises)
	zonesBar.stop()

	let totalZones = [0, 0, 0, 0, 0]
	for (id in zones) {
		for (i = 0; i < 5; i++) {
			totalZones[i] += zones[id][i].time
		}
	}

	console.log("")
	let totalTimeInZones = totalZones.reduce(sumArray)
	for (id in totalZones) {
		let zoneId = parseInt(id) + 1
		let timeInZone = moment.duration(totalZones[id], "seconds").format("H:mm:ss")
		let percentage = parseFloat(totalZones[id] / totalTimeInZones * 100).toFixed(2)
		console.log("Zone " + zoneId + ": " + percentage + "% (" + timeInZone + ")")
	}
}

async function main() {
	try {
		console.log("Note: Private Activities won't be included in summary due to Public Access Token")
		console.log("")
		const activities = await getActivities()
		await calculateTimeInZones(activities)
		console.log("")
		console.log("Strava request count", stravaRequestCount)
	} catch (err) {
		console.error(err)
	}
}

main()
