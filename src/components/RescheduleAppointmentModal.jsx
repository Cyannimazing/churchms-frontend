"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  X,
} from "lucide-react";
import axios from "@/lib/axios";
import { Button } from "@/components/Button.jsx";

/**
 * Modal that lets a user reschedule an existing appointment.
 *
 * It reuses the public schedules + remaining-slots APIs that are used
 * when creating an appointment, but only exposes schedule/date/time
 * selection (requirements and uploads stay attached to the appointment).
 */
const RescheduleAppointmentModal = ({ appointment, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [service, setService] = useState(null);
  const [church, setChurch] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedScheduleTime, setSelectedScheduleTime] = useState(null);

  const [scheduleSlotCounts, setScheduleSlotCounts] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Normalized original appointment date (midnight) so we can prevent selecting
  // the exact same date in the reschedule calendar.
  const originalAppointmentDate = useMemo(() => {
    if (!appointment?.AppointmentDate) return null;
    const d = new Date(appointment.AppointmentDate);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }, [appointment]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!appointment) return;

    const loadDetailsAndSchedules = async () => {
      try {
        setLoading(true);
        setError(null);
        setSchedulesError(null);

        // 1) Load full appointment details to get ServiceID / ChurchID
        const detailsResp = await axios.get(`/api/appointments/${appointment.AppointmentID}`);
        const details = detailsResp.data || {};

        const serviceId = details.ServiceID || details.service?.ServiceID;
        const churchName = details.ChurchName || details.church?.church_name;

        setService(details.service || {
          ServiceID: serviceId,
          ServiceName: details.ServiceName,
          Description: details.ServiceDescription,
        });
        setChurch(details.church || {
          church_name: churchName,
        });

        // Center calendar around the current appointment date if possible
        if (details.AppointmentDate) {
          const d = new Date(details.AppointmentDate);
          if (!isNaN(d.getTime())) {
            setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }
        }

        if (!serviceId) {
          throw new Error("Missing service for appointment.");
        }

        // 2) Load public schedules for this service
        setSchedulesLoading(true);
        const schedResp = await axios.get(`/api/sacrament-services/${serviceId}/schedules-public`);
        const schedData = schedResp.data || {};
        setSchedules(schedData.schedules || []);
      } catch (err) {
        console.error("Error loading reschedule data", err);
        const message =
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          "Failed to load data for rescheduling.";
        setError(message);
      } finally {
        setLoading(false);
        setSchedulesLoading(false);
      }
    };

    loadDetailsAndSchedules();
  }, [appointment]);

  // --- Calendar helpers ---
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isSameDay = (date1, date2) => {
    return (
      date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear()
    );
  };

  const navigateMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
    setSelectedDate(null);
    setSelectedSchedule(null);
    setSelectedScheduleTime(null);
  };

  // --- Schedules + slots helpers (mirrors SacramentApplicationModal) ---
  const getSchedulesForDate = (date) => {
    return schedules.filter((schedule) => {
      const scheduleDate = new Date(schedule.StartDate);

      // Check schedules with recurrence patterns
      if (schedule.IsRecurring && schedule.RecurrencePattern) {
        const pattern = schedule.RecurrencePattern.toLowerCase().trim();

        // Handle "one time on [date]" patterns
        if (pattern.startsWith("one time on ")) {
          if (schedule.recurrences && schedule.recurrences.length > 0) {
            const recurrence = schedule.recurrences[0];
            if (recurrence.RecurrenceType === "OneTime" && recurrence.SpecificDate) {
              const specificDate = new Date(recurrence.SpecificDate);
              const normalizedSpecificDate = new Date(
                specificDate.getFullYear(),
                specificDate.getMonth(),
                specificDate.getDate()
              );
              const normalizedCheckDate = new Date(
                date.getFullYear(),
                date.getMonth(),
                date.getDate()
              );
              return (
                normalizedCheckDate.getTime() === normalizedSpecificDate.getTime()
              );
            }
          }
        }
        // Handle "every [day]" patterns
        else if (pattern.startsWith("every ")) {
          const dayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ];

          const dayPart = pattern.replace("every ", "").trim();

          let scheduleDayOfWeek = -1;
          for (let i = 0; i < dayNames.length; i++) {
            const dayRegex = new RegExp(`\\b${dayNames[i]}\\b`, "i");
            if (dayRegex.test(dayPart)) {
              scheduleDayOfWeek = i;
              break;
            }
          }

          if (scheduleDayOfWeek !== -1 && date.getDay() === scheduleDayOfWeek && date >= scheduleDate) {
            return true;
          }
        }
        // Handle "[ordinal] [day] of every month"
        else if (pattern.includes("of every month")) {
          const dayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ];

          let scheduleDayOfWeek = -1;
          for (let i = 0; i < dayNames.length; i++) {
            const dayRegex = new RegExp(`\\b${dayNames[i]}\\b`, "i");
            if (dayRegex.test(pattern)) {
              scheduleDayOfWeek = i;
              break;
            }
          }

          if (scheduleDayOfWeek !== -1 && date.getDay() === scheduleDayOfWeek && date >= scheduleDate) {
            const dayOfMonth = date.getDate();
            const weekOfMonth = Math.ceil(dayOfMonth / 7);

            const ordinalMap = {
              first: 1,
              second: 2,
              third: 3,
              fourth: 4,
              fifth: 5,
            };

            for (const [ordinal, number] of Object.entries(ordinalMap)) {
              if (pattern.includes(ordinal)) {
                return weekOfMonth === number;
              }
            }
          }
        }
      } else {
        // Non-recurring (including OneTime via recurrences)
        if (schedule.recurrences && schedule.recurrences.length > 0) {
          const recurrence = schedule.recurrences[0];
          if (recurrence.RecurrenceType === "OneTime" && recurrence.SpecificDate) {
            const specificDate = new Date(recurrence.SpecificDate);
            const normalizedSpecificDate = new Date(
              specificDate.getFullYear(),
              specificDate.getMonth(),
              specificDate.getDate()
            );
            const normalizedCheckDate = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate()
            );
            return normalizedCheckDate.getTime() === normalizedSpecificDate.getTime();
          }
        }

        if (isSameDay(scheduleDate, date)) {
          return true;
        }
      }

      return false;
    });
  };

  const hasSchedulesOnDate = (date) => getSchedulesForDate(date).length > 0;

  const fetchScheduleSlots = async (scheduleId, date) => {
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${day}`;

      const response = await axios.get("/api/schedule-remaining-slots", {
        params: { schedule_id: scheduleId, date: dateString },
      });

      const slotKey = `${scheduleId}_${dateString}`;
      setScheduleSlotCounts((prev) => ({
        ...prev,
        [slotKey]: response.data,
      }));

      return response.data;
    } catch (err) {
      console.error("Error fetching schedule slots", err);
      return null;
    }
  };

  const selectDate = async (date) => {
    const schedulesForDate = getSchedulesForDate(date);
    if (schedulesForDate.length === 0) return;

    setSelectedDate(date);
    setSelectedSchedule(null);
    setSelectedScheduleTime(null);
    setSlotsLoading(true);

    try {
      await Promise.all(
        schedulesForDate.map((schedule) => fetchScheduleSlots(schedule.ScheduleID, date))
      );
    } finally {
      setSlotsLoading(false);
    }
  };

  const formatTimeRange = (start, end) => {
    if (!start || !end) return "";
    const toDisplay = (t) => {
      const [h, m] = t.split(":");
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${m} ${ampm}`;
    };
    return `${toDisplay(start)} - ${toDisplay(end)}`;
  };

  const getSlotAvailabilityText = (schedule, date) => {
    if (!date) return `${schedule.SlotCapacity}/${schedule.SlotCapacity} left`;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    const slotKey = `${schedule.ScheduleID}_${dateKey}`;
    const slotInfo = scheduleSlotCounts[slotKey];

    if (slotInfo && slotInfo.time_slots && slotInfo.time_slots.length > 0) {
      const firstTimeSlot = slotInfo.time_slots[0];
      const available = firstTimeSlot.RemainingSlots;
      const total = firstTimeSlot.SlotCapacity;
      return `${available}/${total} left`;
    }

    return `${schedule.SlotCapacity}/${schedule.SlotCapacity} left`;
  };

  const getAvailableSlotsForTime = (schedule, scheduleTime, date) => {
    if (!date) return schedule.SlotCapacity;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    const slotKey = `${schedule.ScheduleID}_${dateKey}`;
    const slotInfo = scheduleSlotCounts[slotKey];

    const timeSlotInfo = slotInfo?.time_slots?.find(
      (ts) => ts.ScheduleTimeID === scheduleTime.ScheduleTimeID
    );

    return timeSlotInfo ? timeSlotInfo.RemainingSlots : schedule.SlotCapacity;
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSchedule || !selectedScheduleTime) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const localDateString = `${year}-${month}-${day}`;

      const payload = {
        schedule_id: selectedSchedule.ScheduleID,
        schedule_time_id: selectedScheduleTime.ScheduleTimeID,
        selected_date: localDateString,
      };

      const resp = await axios.post(
        `/api/appointments/${appointment.AppointmentID}/reschedule`,
        payload
      );

      if (resp.data?.success) {
        if (onSuccess) onSuccess();
        return;
      }

      setSubmitError(
        resp.data?.message || "Reschedule did not complete. Please try again."
      );
    } catch (err) {
      console.error("Error submitting reschedule", err);

      // Payment-required reschedule (HTTP 402)
      if (err.response?.status === 402 && err.response.data?.requires_payment) {
        const redirectUrl = err.response.data.redirect_url;
        if (redirectUrl) {
          try {
            localStorage.setItem("appointment_reschedule_pending", "1");
          } catch {}
          window.location.href = redirectUrl;
          return;
        }
      }

      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Failed to reschedule appointment. Please try again.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Reschedule Appointment</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {service?.ServiceName || appointment.ServiceName} at {" "}
              {church?.church_name || appointment.ChurchName}
            </p>
            <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              You can only reschedule up to 3 days before the appointment date.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="mt-3 text-sm text-gray-600">Loading schedules...</p>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-red-700 mb-2">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  // Retry by forcing effect to rerun via dummy state: simplest is just refresh page
                  window.location.reload();
                }}
                className="mt-1"
              >
                Retry
              </Button>
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                No schedules are currently available for this service.
              </p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-4">
              {/* Left: calendar */}
              <div className="flex-1 md:max-w-[50%]">
                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-2 rounded-md hover:bg-gray-200 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h4 className="text-sm font-medium text-gray-900">
                    {currentMonth.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h4>
                  <button
                    onClick={() => navigateMonth(1)}
                    className="p-2 rounded-md hover:bg-gray-200 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Calendar grid */}
                <div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div
                        key={day}
                        className="p-2 text-center text-xs font-medium text-gray-500"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map(
                      (_, index) => (
                        <div key={`empty-${index}`} className="p-2 h-10" />
                      )
                    )}

                    {Array.from({ length: getDaysInMonth(currentMonth) }).map(
                      (_, index) => {
                        const day = index + 1;
                        const date = new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth(),
                          day
                        );
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        date.setHours(0, 0, 0, 0);

                        const isToday = isSameDay(date, today);
                        const isPast = date < today && !isToday;
                        const hasSchedules = hasSchedulesOnDate(date);
                        const isSelected =
                          selectedDate && isSameDay(date, selectedDate);

                        const isSameAsOriginal =
                          originalAppointmentDate &&
                          isSameDay(date, originalAppointmentDate);

                        const isDisabledBase = isPast || !hasSchedules;
                        const isDisabled = isDisabledBase || isSameAsOriginal;

                        return (
                          <button
                            key={day}
                            onClick={() => !isDisabled && selectDate(date)}
                            disabled={isDisabled}
                            className={`relative p-2 h-12 text-xs font-medium rounded-lg transition-all
                              ${isSelected
                                ? "bg-blue-600 text-white shadow-md scale-105 z-10 cursor-pointer"
                                : hasSchedules && !isDisabled
                                  ? "bg-green-50 text-green-900 border border-green-300 hover:bg-green-100 hover:border-green-400 cursor-pointer"
                                  : "text-gray-300 cursor-not-allowed"}
                              ${
                                isToday && !isSelected
                                  ? "ring-1 ring-blue-400 ring-offset-1"
                                  : ""
                              }
                            `}
                            title={
                              isSameAsOriginal
                                ? "You are already scheduled on this date"
                                : hasSchedules && !isDisabledBase
                                  ? "Available - click to view times"
                                  : isPast
                                    ? "Past date"
                                    : "No schedules available"
                            }
                          >
                            <span className="relative z-10">{day}</span>
                            {hasSchedules && !isDisabled && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                <svg
                                  className="w-6 h-6 text-green-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {!selectedDate && (
                  <div className="mt-4 text-xs text-gray-500 text-center">
                    Select a highlighted date to view available times.
                  </div>
                )}
              </div>

              {/* Right: schedules + times */}
              <div className="flex-1 md:border-l border-gray-200 md:pl-4 mt-4 md:mt-0">
                {selectedDate ? (
                  <div>
                    {slotsLoading ? (
                      <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        <span className="mt-2 text-sm text-gray-600">
                          Loading slots...
                        </span>
                      </div>
                    ) : (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2 text-sm">
                          Available schedules
                        </h5>
                        <p className="text-xs text-gray-600 mb-3">
                          {selectedDate.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                          {getSchedulesForDate(selectedDate).map((schedule) => {
                            const year = selectedDate.getFullYear();
                            const month = String(
                              selectedDate.getMonth() + 1
                            ).padStart(2, "0");
                            const day = String(selectedDate.getDate()).padStart(
                              2,
                              "0"
                            );
                            const dateKey = `${year}-${month}-${day}`;
                            const slotKey = `${schedule.ScheduleID}_${dateKey}`;
                            const slotInfo = scheduleSlotCounts[slotKey];

                            let hasScheduleSlots = true;
                            if (
                              slotInfo &&
                              slotInfo.time_slots &&
                              slotInfo.time_slots.length > 0
                            ) {
                              hasScheduleSlots = slotInfo.time_slots.some(
                                (ts) => ts.RemainingSlots > 0
                              );
                            } else {
                              hasScheduleSlots = schedule.SlotCapacity > 0;
                            }

                            // If schedule has explicit times, render one card per time slot.
                            const times = schedule.times && schedule.times.length > 0
                              ? schedule.times
                              : [null];

                            return times.map((scheduleTime, index) => {
                              const availableSlots = scheduleTime
                                ? getAvailableSlotsForTime(
                                    schedule,
                                    scheduleTime,
                                    selectedDate
                                  )
                                : schedule.SlotCapacity;
                              const hasAvailableSlots = hasScheduleSlots && availableSlots > 0;
                              const isSelected =
                                selectedSchedule?.ScheduleID === schedule.ScheduleID &&
                                (!scheduleTime ||
                                  selectedScheduleTime?.ScheduleTimeID ===
                                    scheduleTime.ScheduleTimeID);

                              return (
                                <div
                                  key={`${schedule.ScheduleID}-${scheduleTime?.ScheduleTimeID || index}-${selectedDate.toISOString()}`}
                                  onClick={() => {
                                    if (!hasAvailableSlots) return;
                                    setSelectedSchedule(schedule);
                                    if (scheduleTime) {
                                      setSelectedScheduleTime(scheduleTime);
                                    }
                                  }}
                                  className={`p-2.5 border rounded-lg transition-all flex items-start justify-between gap-3 ${
                                    hasAvailableSlots
                                      ? "border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
                                      : "border-red-200 bg-red-50 cursor-not-allowed opacity-75"
                                  } ${isSelected ? "border-blue-500 bg-blue-50" : ""}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                                      <span className="font-semibold text-xs text-gray-900">
                                        Schedule #{schedule.ScheduleID}
                                      </span>
                                      {schedule.sub_sacrament_service && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-800">
                                          {schedule.sub_sacrament_service.SubServiceName}
                                        </span>
                                      )}
                                      {!hasAvailableSlots && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800">
                                          Fully booked
                                        </span>
                                      )}
                                    </div>
                                    <div className="space-y-1.5 text-xs text-gray-600">
                                      <div className="flex items-center">
                                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                                        <span>
                                          {scheduleTime
                                            ? formatTimeRange(
                                                scheduleTime.StartTime,
                                                scheduleTime.EndTime
                                              )
                                            : schedule.times?.length === 1
                                              ? formatTimeRange(
                                                  schedule.times[0].StartTime,
                                                  schedule.times[0].EndTime
                                                )
                                              : `${
                                                  schedule.times?.length || 0
                                                } time slots`}
                                        </span>
                                      </div>
                                      <div className="flex items-center">
                                        <Users className="w-3.5 h-3.5 mr-1.5" />
                                        <span
                                          className={
                                            hasAvailableSlots
                                              ? "text-gray-600"
                                              : "text-red-600"
                                          }
                                        >
                                          {scheduleTime
                                            ? `${availableSlots}/${schedule.SlotCapacity} left`
                                            : getSlotAvailabilityText(
                                                schedule,
                                                selectedDate
                                              )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Calendar className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm text-gray-500 font-medium">
                      Select a date
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Click on a highlighted date to see available schedules.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-xs text-gray-500">
            Current schedule:
            <span className="font-medium text-gray-700 ml-1">
              {new Date(appointment.AppointmentDate).toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !selectedDate ||
                !selectedSchedule ||
                !selectedScheduleTime
              }
            >
              {submitting ? "Rescheduling..." : "Confirm Reschedule"}
            </Button>
          </div>
        </div>

        {submitError && (
          <div className="px-5 pb-4 text-xs text-red-600">{submitError}</div>
        )}
      </div>
    </div>
  );
};

export default RescheduleAppointmentModal;
