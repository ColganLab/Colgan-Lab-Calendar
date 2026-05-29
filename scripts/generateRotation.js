export function getHoliday(date) {
  const d = date.getDate();
  const m = date.getMonth();
  const day = date.getDay();

  if (m === 0 && d === 1) return "New Year's Day";
  if (m === 0 && d >= 15 && d <= 21) return "MLK Jr. Day";
if (
  m === 4 &&
  day === 1 &&
  d + 7 > 31
)
{
  return "Memorial Day";
}  if (m === 5 && d === 19) return "Juneteenth";
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

  const presenterStats = {};

activeParticipants.forEach(p => {
  presenterStats[p.name] = {
    count: 0,
    lastDate: null
  };
});

schedule.forEach(s => {
  if (
    s.type === 'PRES' &&
    s.presenter &&
    presenterStats[s.presenter.name]
  ) {
    presenterStats[s.presenter.name].count++;

    const eventDate = new Date(s.date);

    if (
      !presenterStats[s.presenter.name].lastDate ||
      eventDate > presenterStats[s.presenter.name].lastDate
    ) {
      presenterStats[s.presenter.name].lastDate = eventDate;
    }
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

      const DAYS_COOLDOWN = 28;

function daysSince(date, currentDate) {
  if (!date) return 99999;

  return Math.floor(
    (currentDate - date) /
    (1000 * 60 * 60 * 24)
  );
}

const ranked = activeParticipants
  .map(person => {

    const stats = presenterStats[person.name];

    const daysWaited =
      daysSince(stats.lastDate, iterDate);

    const cooldownPenalty =
      daysWaited < DAYS_COOLDOWN
        ? 100000
        : 0;

    const score =
      (stats.count * 1000)
      + cooldownPenalty
      - daysWaited;

    return {
      person,
      score,
      count: stats.count,
      daysWaited
    };
  })
  .sort((a, b) => {

    if (a.score !== b.score) {
      return a.score - b.score;
    }

    if (a.count !== b.count) {
      return a.count - b.count;
    }

    if (a.daysWaited !== b.daysWaited) {
      return b.daysWaited - a.daysWaited;
    }

    return a.person.name.localeCompare(
      b.person.name
    );
  });

const chosen = ranked[0].person;

      newScheduleChunk.push({
        date: new Date(iterDate),
        type: 'PRES',
        presenter: chosen
      });

presenterStats[chosen.name].count++;

presenterStats[chosen.name].lastDate =
  new Date(iterDate);    }

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
