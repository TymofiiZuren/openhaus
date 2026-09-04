type SearchableProperty = {
  id: string
  title: string
  addressLine1: string
  city: string
  county: string
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-IE')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function trigrams(value: string) {
  const compact = value.replace(/\s+/g, ' ')
  const values = new Set<string>()
  for (let index = 0; index <= compact.length - 3; index += 1) values.add(compact.slice(index, index + 3))
  return values
}

export function createPropertySearchIndex(properties: SearchableProperty[]) {
  const documents = new Map<string, string>()
  const postings = new Map<string, Set<string>>()

  for (const property of properties) {
    const document = normalize(`${property.title} ${property.addressLine1} ${property.city} ${property.county}`)
    documents.set(property.id, document)
    for (const gram of trigrams(document)) {
      const matches = postings.get(gram) ?? new Set<string>()
      matches.add(property.id)
      postings.set(gram, matches)
    }
  }

  return {
    search(value: string) {
      const query = normalize(value)
      if (!query) return new Set(documents.keys())

      const terms = query.split(' ')
      const grams = terms.flatMap((term) => [...trigrams(term)])
      const smallestFirst = grams
        .map((gram) => postings.get(gram) ?? new Set<string>())
        .sort((left, right) => left.size - right.size)
      const candidates = query.length < 3 || smallestFirst.length === 0
        ? [...documents.keys()]
        : [...smallestFirst[0]].filter((id) => smallestFirst.every((matches) => matches.has(id)))

      return new Set(candidates.filter((id) => {
        const document = documents.get(id)
        return document !== undefined && terms.every((term) => document.includes(term))
      }))
    },
  }
}
