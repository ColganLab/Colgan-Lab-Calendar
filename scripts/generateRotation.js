export function getHoliday(date) {
  const d = date.getDate();
  const m = date.getMonth();
  const day = date.getDay();

  if (day !== 1) return null;

  if (m === 0 && d === 1) return "New Year's Day";
  if (m === 0 && d >= 15 && d <= 21) return "MLK Jr. Day";
  if (m === 4 && d >= 25) return "Memorial Day";
  if (m === 5 && d === 19) return "Juneteenth";
  if (m === 8 && d <= 7) return "Labor Day";
  if (m === 10 && d >= 19 && d <= 25) return "Thanksgiving Break";

  return null;
}

export function generateRotationLogic({
  participants,
  schedule,
  chunkStart,
  chunkEnd
}) {

  const activeParticipants = participants.filter(
    p => !p.hold && !p.retired
  );

  /*
  |--------------------------------------------------------------------------
  | Preserve Existing Manual Events
  |--------------------------------------------------------------------------
  */

  const retainedSchedule = schedule.filter(s => {
    if (s.type === 'CUSTOM' || s.type === 'HOLIDAY') return true;

    if (s.manual) return true;

    if (s.date < chunkStart || s.date > chunkEnd) return true;

    return false;
  });

  /*
  |--------------------------------------------------------------------------
  | Presentation Counts
  |--------------------------------------------------------------------------
  |
  | Count every presentation already assigned before the chunk.
  | Firebase insertion order is preserved by activeParticipants.
  |--------------------------------------------------------------------------
  */

  const presentationCounts = {};

  activeParticipants.forEach(p => {
    presentationCounts[p.name] = 0;
  });

  schedule.forEach(s => {
    if (
      s.type === 'PRES' &&
      s.presenter &&
      presentationCounts.hasOwnProperty(s.presenter.name) &&
      s.date < chunkStart
    ) {
      presentationCounts[s.presenter.name]++;
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Build New Rotation
  |--------------------------------------------------------------------------
  */

  const newScheduleChunk = [];

  let iterDate = new Date(chunkStart);

  iterDate.setHours(9, 0, 0, 0);

  while (iterDate.getDay() !== 1) {
    iterDate.setDate(iterDate.getDate() + 1);
  }

  while (iterDate <= chunkEnd) {

    const holiday = getHoliday(iterDate);

    const firstDayOfMonth = new Date(
      iterDate.getFullYear(),
      iterDate.getMonth(),
      1
    );

    let firstMon = new Date(firstDayOfMonth);

    while (firstMon.getDay() !== 1) {
      firstMon.setDate(firstMon.getDate() + 1);
    }

    const isFirstMon =
      iterDate.getDate() === firstMon.getDate();

    /*
    |--------------------------------------------------------------------------
    | Existing Event Already Occupies This Date
    |--------------------------------------------------------------------------
    */

    const existingEvent = retainedSchedule.find(s =>
      s.date.getFullYear() === iterDate.getFullYear() &&
      s.date.getMonth() === iterDate.getMonth() &&
      s.date.getDate() === iterDate.getDate() &&
      (
        s.type === 'PRES' ||
        s.type === 'WHOLE' ||
        s.type === 'HOLIDAY'
      )
    );

    if (existingEvent) {

      if (
        existingEvent.type === 'PRES' &&
        existingEvent.presenter &&
        presentationCounts.hasOwnProperty(
          existingEvent.presenter.name
        )
      ) {
        presentationCounts[
          existingEvent.presenter.name
        ]++;
      }

      iterDate.setDate(iterDate.getDate() + 7);
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | Holiday
    |--------------------------------------------------------------------------
    */

    if (holiday) {

      newScheduleChunk.push({
        date: new Date(iterDate),
        type: 'HOLIDAY',
        title: holiday
      });

    }

    /*
    |--------------------------------------------------------------------------
    | Whole Lab Meeting
    |--------------------------------------------------------------------------
    */

    else if (isFirstMon) {

      newScheduleChunk.push({
        date: new Date(iterDate),
        type: 'WHOLE',
        title: 'Whole Lab Update'
      });

    }

    /*
    |--------------------------------------------------------------------------
    | Fair Round Robin
    |--------------------------------------------------------------------------
    */

    else {

      if (activeParticipants.length === 0) {
        iterDate.setDate(iterDate.getDate() + 7);
        continue;
      }

      let chosen = activeParticipants[0];

      for (const person of activeParticipants) {

        if (
          presentationCounts[person.name] <
          presentationCounts[chosen.name]
        ) {
          chosen = person;
        }
      }

      newScheduleChunk.push({
        date: new Date(iterDate),
        type: 'PRES',
        presenter: chosen
      });

      presentationCounts[chosen.name]++;
    }

    iterDate.setDate(iterDate.getDate() + 7);
  }

  /*
  |--------------------------------------------------------------------------
  | Merge + Sort
  |--------------------------------------------------------------------------
  */

  const finalSchedule = [
    ...retainedSchedule,
    ...newScheduleChunk
  ];

  finalSchedule.sort(
    (a, b) => a.date - b.date
  );

  return finalSchedule;
}
