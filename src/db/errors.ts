export function errorMessage(error: unknown): string {
    const messages: string[] = []
    let current: unknown = error

    while (current instanceof Error) {
        messages.push(current.message)
        current = (current as Error & { cause?: unknown }).cause
    }

    return messages.join(' ')
}
