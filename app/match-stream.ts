import {
  type ShapeStream,
  type ChangeMessage,
  type Row,
  isChangeMessage,
} from "@electric-sql/client"

export async function matchStream<T extends Row>({
  stream,
  operations,
  matchFn,
  timeout = 10000,
}: {
  stream: ShapeStream<T>
  operations: Array<`insert` | `update` | `delete`>
  matchFn: ({
    operationType,
    message,
  }: {
    operationType: string
    message: ChangeMessage<T>
  }) => boolean
  timeout?: number
}): Promise<ChangeMessage<T>> {
  return new Promise<ChangeMessage<T>>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(`matchStream timed out after ${timeout}ms`)
    }, timeout)

    const unsubscribe = stream.subscribe((messages) => {
      const message = messages.filter(isChangeMessage).find(
        (message) =>
          operations.includes(message.headers.operation) &&
          matchFn({
            operationType: message.headers.operation,
            message: message,
          })
      )

      if (message) {
        clearTimeout(timeoutId)
        unsubscribe()
        return resolve(message)
      }
    })
  })
}