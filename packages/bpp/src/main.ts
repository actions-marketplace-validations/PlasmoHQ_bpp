import { debug, getInput, info, setFailed, warning } from "@actions/core"
import {
  BrowserName,
  type ChromeOptions,
  CommonOptions,
  type EdgeOptions,
  type FirefoxOptions,
  type OperaOptions,
  submitChrome,
  submitEdge,
  submitFirefox,
  supportedBrowserSet
} from "@plasmohq/bms"

type Keys = {
  [BrowserName.Chrome]: ChromeOptions
  [BrowserName.Firefox]: FirefoxOptions
  [BrowserName.Opera]: OperaOptions
  [BrowserName.Edge]: EdgeOptions
}

const tag = (prefix: string) => `${prefix.padEnd(9)} |`

const hasBundleFile = (opt: CommonOptions) => !!opt.zip || !!opt.file

async function run(): Promise<void> {
  try {
    info(`🟣 Plasmo Browser Platform Publish v3`)

    // All the keys necessary to deploy the extension
    const keys: Keys = JSON.parse(getInput("keys", { required: true }))
    // Path to the zip file to be deployed
    const artifact = getInput("file") || getInput("zip") || getInput("artifact")
    const versionFile = getInput("version-file")

    const notes = getInput("notes")

    const verbose = !!getInput("verbose")

    if (verbose) {
      // All internal logging goes to info
      console.log = info
    }

    const browserEntries = Object.keys(keys).filter((browser) =>
      supportedBrowserSet.has(browser as BrowserName)
    ) as BrowserName[]

    if (browserEntries.length === 0) {
      throw new Error("No supported browser found")
    }

    const hasAtLeastOneZip =
      !!artifact || browserEntries.some((b) => hasBundleFile(keys[b]))

    if (!hasAtLeastOneZip) {
      throw new Error("No artifact found for deployment")
    }

    // Enrich keys with zip artifact and notes as needed
    browserEntries.forEach((browser: BrowserName) => {
      if (!hasBundleFile(keys[browser])) {
        if (!artifact) {
          warning(
            `${tag("🟡 SKIP")} No artifact available to submit for ${browser}`
          )
        } else {
          keys[browser].zip = artifact
        }
      }
      if (!keys[browser].versionFile) {
        keys[browser].versionFile = versionFile
      }

      if (!!notes) {
        keys[browser].notes = notes
      }

      keys[browser].verbose = verbose
    })

    if (process.env.NODE_ENV === "test") {
      debug(JSON.stringify({ artifact, versionFile, verbose }))
      debug(browserEntries.join(","))
      return
    }

    const deployPromises = browserEntries.map((browser) => {
      if (!hasBundleFile(keys[browser])) {
        return false
      }
      info(`${tag("🟡 QUEUE")} Prepare for ${browser} submission`)

      switch (browser) {
        case BrowserName.Chrome:
          return submitChrome(keys[browser])
        case BrowserName.Firefox:
          return submitFirefox(keys[browser])
        case BrowserName.Edge:
          return submitEdge(keys[browser])
      }
    })

    const results = await Promise.allSettled(deployPromises)

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        setFailed(`${tag("🔴 ERROR")} ${result.reason}`)
      } else if (result.value) {
        info(`${tag("🟢 DONE")} ${browserEntries[index]} submission successful`)
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      setFailed(`${tag("🔴 ERROR")} ${error.message}`)
    }
  }
}

run()
