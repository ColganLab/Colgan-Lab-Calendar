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

  let retainedSchedule = schedule.filter(s => {
    if (s.type === 'CUSTOM' || s.type === 'HOLIDAY') return true;

    if (s.manual) return true;

    if (s.date < chunkStart || s.date > chunkEnd) return true;

    return false;
  });

  /*
  |--------------------------------------------------------------------------
  | Track Last Presentation Dates
  |--------------------------------------------------------------------------
  */

  let lastPresDateMap = {};

  activeParticipants.forEach(p => {
    lastPresDateMap[p.name] = 0;
  });

  retainedSchedule.forEach(s => {
    if (
      s.type === 'PRES' &&
      s.presenter &&
      lastPresDateMap.hasOwnProperty(s.presenter.name)
    ) {
      if (s.date.getTime() > lastPresDateMap[s.presenter.name]) {
        lastPresDateMap[s.presenter.name] =
          s.date.getTime();
      }
    }
  });

  let prevPresEvents = retainedSchedule
    .filter(s =>
      s.type === 'PRES' &&
      s.date < chunkStart
    )
    .sort((a, b) => b.date - a.date);

  let lastGroup =
    prevPresEvents.length > 0
      ? prevPresEvents[0].presenter.group
      : "";

  /*
  |--------------------------------------------------------------------------
  | True Group-Balanced Round Robin
  |--------------------------------------------------------------------------
  */

  const groups = {};

  activeParticipants.forEach(p => {
    const g = p.group || 'Unassigned';
    (groups[g] ||= []).push(p);
  });

  const groupNames = Object.keys(groups).sort();

  const rotationRing = [];
  let added = true;

  while (added) {
    added = false;

    for (const g of groupNames) {
      if (groups[g].length) {
        rotationRing.push(groups[g].shift());
        added = true;
      }
    }
  }

  let rotationCursor =
    schedule.filter(s => s.type === 'PRES').length %
    Math.max(rotationRing.length, 1);

  /*
  |--------------------------------------------------------------------------
  | Build New Rotation
  |--------------------------------------------------------------------------
  */

  let newScheduleChunk = [];

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
    | Skip Existing Manual Events
    |--------------------------------------------------------------------------
    */

    let hasManualEvent = retainedSchedule.some(s =>
      s.date.getFullYear() === iterDate.getFullYear() &&
      s.date.getMonth() === iterDate.getMonth() &&
      s.date.getDate() === iterDate.getDate() &&
      (
        s.type === 'PRES' ||
        s.type === 'WHOLE' ||
        s.type === 'HOLIDAY'
      )
    );

    if (hasManualEvent) {

      let manualEv = retainedSchedule.find(s =>
        s.date.getFullYear() === iterDate.getFullYear() &&
        s.date.getMonth() === iterDate.getMonth() &&
        s.date.getDate() === iterDate.getDate() &&
        s.type === 'PRES'
      );

      if (manualEv && manualEv.presenter) {

        lastGroup = manualEv.presenter.group;

        if (
          lastPresDateMap.hasOwnProperty(
            manualEv.presenter.name
          )
        ) {
          lastPresDateMap[
            manualEv.presenter.name
          ] = iterDate.getTime();
        }
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
    | Presenter Rotation
    |--------------------------------------------------------------------------
    */

    else {

      let chosen = rotationRing[rotationCursor % rotationRing.length];
      let safety = 0;

      while (
        chosen &&
        chosen.group === lastGroup &&
        safety < rotationRing.length
      ) {
        rotationCursor++;
        chosen = rotationRing[rotationCursor % rotationRing.length];
        safety++;
      }

      rotationCursor++;

      newScheduleChunk.push({
        date: new Date(iterDate),
        type: 'PRES',
        presenter: chosen
      });

      lastGroup = chosen.group;

      lastPresDateMap[chosen.name] =
        iterDate.getTime();
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

  finalSchedule.sort((a, b) => a.date - b.date);

  return finalSchedule;
}
