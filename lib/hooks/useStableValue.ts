'use client'

import { useRef } from 'react'

/**
 * Compare the flat records used by the local database without requiring a
 * deep clone. Database reads create fresh objects, even when their values did
 * not change, so reference equality alone is too eager for UI subscriptions.
 */
export function shallowEqualValue<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord, key)
    && Object.is(leftRecord[key], rightRecord[key])
  ))
}

/** Keep the previous value when a subscription only changed its identity. */
export function useStableValue<T>(value: T, isEqual: (left: T, right: T) => boolean = Object.is): T {
  const valueRef = useRef(value)
  if (!isEqual(valueRef.current, value)) valueRef.current = value
  return valueRef.current
}

/**
 * Preserve unchanged item references and the array reference when possible.
 * Callers must treat the input array as immutable (which Dexie queries do).
 */
export function useStableArray<T>(values: T[], isEqual: (left: T, right: T) => boolean = Object.is): T[] {
  const valuesRef = useRef(values)
  const previous = valuesRef.current

  if (previous === values) return values

  if (previous.length === values.length) {
    let hasChanges = false
    const next = values.map((value, index) => {
      const previousValue = previous[index]
      if (isEqual(previousValue, value)) return previousValue
      hasChanges = true
      return value
    })

    if (!hasChanges) return previous
    valuesRef.current = next
    return next
  }

  valuesRef.current = values
  return values
}
