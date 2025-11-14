"use client";

import React, { useEffect, useState } from "react";
import axios from "@/lib/axios";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/Button.jsx";
import InlineCalendar from "@/components/ui/InlineCalendar.jsx";

/**
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - appointmentId: number
 * - appointmentDate: string (ISO or 'YYYY-MM-DD HH:mm:ss')
 * - subServices: [{ id, name, description }]
 * - onComplete: (picks: [{ sub_service_id, date, start_time, end_time }]) => void
 */
const SubServiceScheduleModal = ({ isOpen, onClose, appointmentId, appointmentDate = null, subServices = [], onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentDate, setCurrentDate] = useState(""); // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState(null); // schedule row
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [picks, setPicks] = useState([]);

  const hasSubServices = Array.isArray(subServices) && subServices.length > 0;

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen && hasSubServices) {
      setCurrentIndex(0);
      setCurrentDate("");
      setSelectedTime(null);
      setSchedules([]);
      setIsLoading(false);
      setError("");
      setPicks([]);
    }
  }, [isOpen, hasSubServices]);

  const currentSubService = hasSubServices ? subServices[currentIndex] : null;

  // Fetch sub-service details with schedules when index changes
  useEffect(() => {
    if (!isOpen || !currentSubService?.id) return;

    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError("");
        setSchedules([]);
        setSelectedTime(null);

        const response = await axios.get(`/api/sub-services/${currentSubService.id}`);
        const data = response.data || {};
        const svcSchedules = data.schedules || [];
        setSchedules(svcSchedules);
      } catch (err) {
        console.error("Failed to load sub-service schedules", err);
        setError("Failed to load schedules for this step. You can still approve without a specific date.");
        setSchedules([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, currentSubService?.id]);

  if (!isOpen || !hasSubServices) return null;

  const isLast = currentIndex === subServices.length - 1;

  const canPickSpecificDate = schedules && schedules.length > 0;

  const handleNext = () => {
    // If this sub-service has schedules, require date + time
    if (canPickSpecificDate) {
      if (!currentDate || !selectedTime) {
        setError("Please select a date and time slot before continuing.");
        return;
      }

      const newPick = {
        sub_service_id: currentSubService.id,
        date: currentDate,
        start_time: selectedTime.StartTime?.slice(0, 5) || null,
        end_time: selectedTime.EndTime?.slice(0, 5) || null,
      };

      setPicks((prev) => {
        const existingIndex = prev.findIndex((p) => p.sub_service_id === newPick.sub_service_id);
        if (existingIndex >= 0) {
          const clone = [...prev];
          clone[existingIndex] = newPick;
          return clone;
        }
        return [...prev, newPick];
      });
    }

    if (isLast) {
      onComplete?.(picks => picks); // placeholder, will be overridden below
    }
  };

  // We can't call onComplete with latest picks from inside handleNext above because setState is async.
  const handleNextWrapped = () => {
    // Temporarily compute the would-be picks synchronously
    let finalPicks = picks;
    if (canPickSpecificDate && currentDate && selectedTime) {
      const newPick = {
        sub_service_id: currentSubService.id,
        date: currentDate,
        start_time: selectedTime.StartTime?.slice(0, 5) || null,
        end_time: selectedTime.EndTime?.slice(0, 5) || null,
      };
      const existingIndex = finalPicks.findIndex((p) => p.sub_service_id === newPick.sub_service_id);
      if (existingIndex >= 0) {
        const clone = [...finalPicks];
        clone[existingIndex] = newPick;
        finalPicks = clone;
      } else {
        finalPicks = [...finalPicks, newPick];
      }
    }

    if (isLast) {
      onComplete?.(finalPicks);
      return;
    }

    setPicks(finalPicks);
    setCurrentIndex((idx) => idx + 1);
    setCurrentDate("");
    setSelectedTime(null);
    setError("");
  };

  const formatTime12Hour = (time) => {
    if (!time) return "";
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr, 10);
    const minutes = minuteStr ?? "00";
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatScheduleLabel = (schedule) => {
    if (!schedule) return "";
    const rawStart = schedule.StartTime || "";
    const rawEnd = schedule.EndTime || "";
    const start = formatTime12Hour(rawStart.slice(0, 5));
    const end = formatTime12Hour(rawEnd.slice(0, 5));
    return `${start} - ${end}`;
  };

  const stepLabel = `${currentIndex + 1} of ${subServices.length}`;

  // Normalize main appointment date to a date-only cutoff (sub-services must be before this day)
  let appointmentCutoffDate = null;
  if (appointmentDate) {
    const raw = typeof appointmentDate === 'string' ? appointmentDate.replace(' ', 'T') : appointmentDate;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      appointmentCutoffDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Schedule Sub-service</p>
            <h2 className="text-lg font-semibold text-gray-900">{currentSubService?.name}</h2>
            <p className="text-xs text-gray-500 mt-1">Step {stepLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {currentSubService?.description && (
            <p className="text-sm text-gray-600">{currentSubService.description}</p>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              Loading schedules...
            </div>
          ) : (
            <>
              {schedules.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  This step has no predefined schedule. You can approve the appointment without selecting a specific date.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Date picker */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-1">
                      <CalendarIcon className="w-4 h-4" />
                      Select specific date
                    </label>
                    <InlineCalendar
                      value={currentDate}
                      onChange={setCurrentDate}
                      isDateAllowed={(date) => {
                        if (!schedules || schedules.length === 0) return true;

                        // Enforce that sub-services happen before the main appointment date
                        if (appointmentCutoffDate) {
                          const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                          if (candidate >= appointmentCutoffDate) {
                            return false;
                          }
                        }

                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const weekdayName = dayNames[date.getDay()];
                        const dayOfMonth = date.getDate();

                        return schedules.some((s) => {
                          const type = s.OccurrenceType || s.occurrenceType || 'weekly';
                          const schedDay = s.DayOfWeek;

                          if (type === 'weekly') {
                            return schedDay === weekdayName;
                          }

                          if (type === 'nth_day_of_month') {
                            if (schedDay !== weekdayName) return false;
                            const occurrence = s.OccurrenceValue;

                            if (!occurrence) return false;

                            if (occurrence === -1) {
                              // last X of month
                              const nextWeekSameDay = dayOfMonth + 7;
                              return new Date(date.getFullYear(), date.getMonth(), nextWeekSameDay).getMonth() !== date.getMonth();
                            }

                            const computedNth = Math.ceil(dayOfMonth / 7);
                            return computedNth === occurrence;
                          }

                          // Fallback: allow all dates
                          return true;
                        });
                      }}
                    />
                  </div>

                  {/* Time slots */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4" />
                      Select time slot
                    </label>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {schedules.map((schedule) => (
                        <button
                          key={schedule.ScheduleID || `${schedule.DayOfWeek}-${schedule.StartTime}`}
                          type="button"
                          onClick={() => setSelectedTime(schedule)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between transition-colors ${
                            selectedTime === schedule
                              ? "border-blue-500 bg-blue-50 text-blue-900"
                              : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                        >
                          <div>
                            <div className="font-medium">
                              {formatScheduleLabel(schedule)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="text-xs text-gray-500">
            Appointment ID: {appointmentId}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleNextWrapped}
              className="px-4 py-1.5 text-sm"
            >
              {isLast ? "Confirm & Approve" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubServiceScheduleModal;
