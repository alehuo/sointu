import * as t from 'io-ts'

export const ExerciseRequestModel = t.type({
  userId: t.string,
  exerciseId: t.number
})

export type ExerciseRequest = t.TypeOf<typeof ExerciseRequestModel>
