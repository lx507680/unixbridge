import { createDfParser, createLsParser, createPsParser } from '../structured'

export function parseLsOutput(raw: string): Array<Record<string, string>> {
  return createLsParser().parse(raw)
}

export function parsePsOutput(raw: string): Array<Record<string, string>> {
  return createPsParser().parse(raw)
}

export function parseDfOutput(raw: string): Array<Record<string, string>> {
  return createDfParser().parse(raw)
}
