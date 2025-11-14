"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import axios from "@/lib/axios";
import { Calendar, Clock, MapPin, FileText, AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/hooks/auth.jsx";
import { useSearchParams } from "next/navigation";

const AppointmentContent = () => {
  const { user } = useAuth({ middleware: "auth" });
  const searchParams = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [highlightedAppointmentId, setHighlightedAppointmentId] = useState(null);
  const highlightedRef = useRef(null);

  // Schedule details modal state (for sub-service schedules)
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [scheduleDetails, setScheduleDetails] = useState(null);

  // Urgency info derived from sub-service schedules per appointment (by id)
  // Shape: { [appointmentId]: { hasSubServiceUrgency, nearestSubServiceName?, daysUntilSubService? } }
  const [appointmentUrgency, setAppointmentUrgency] = useState({});

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get('/api/appointments');
        setAppointments(response.data.appointments);
      } catch (err) {
        console.error('Error fetching appointments:', err);
        setError('Failed to load appointments');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchAppointments();
    }
  }, [user]);

  // Handle highlighting from notification link
  useEffect(() => {
    if (!appointments.length) return;
    
    const appointmentId = searchParams.get('appointmentId');
    if (appointmentId) {
      const parsedId = parseInt(appointmentId, 10);
      setHighlightedAppointmentId(parsedId);
      
      // Scroll to highlighted appointment
      setTimeout(() => {
        if (highlightedRef.current) {
          highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      
      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedAppointmentId(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [appointments, searchParams]);

  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'Pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'Approved':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'Rejected':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'Cancelled':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'Completed':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatTime = (time) => {
    if (!time) return '';
    // Convert 24-hour format to 12-hour format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const parseDate = (input) => {
    if (!input) return null;
    if (input instanceof Date) return input;
    if (typeof input === 'number') return new Date(input);
    if (typeof input === 'string') {
      // Ensure browser-parseable format (YYYY-MM-DDTHH:mm:ss)
      const iso = input.includes('T') ? input : input.replace(' ', 'T');
      let d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
      d = new Date(iso + 'Z');
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const getDaysUntilDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);
    const diffMs = eventDate.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const getHoursElapsed = (createdAt) => {
    const created = parseDate(createdAt);
    if (!created) return 0;
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return diffMs / (1000 * 60 * 60);
  };

  const getRemainingHours = (createdAt) => {
    const hoursElapsed = getHoursElapsed(createdAt);
    const remaining = 72 - hoursElapsed;
    return Math.max(0, remaining);
  };

  const getCreatedAt = (a) => a?.created_at || a?.CreatedAt || a?.createdAt;

  const handleViewScheduleDetails = async (appointment) => {
    try {
      setScheduleError(null);
      setScheduleLoading(true);
      setShowScheduleModal(true);
      setScheduleDetails(null);

      const response = await axios.get(`/api/appointments/${appointment.AppointmentID}`);
      const data = response.data || {};
      const subServices = data.formConfiguration?.sub_services || [];

      setScheduleDetails({
        appointmentId: data.AppointmentID,
        serviceName: data.ServiceName,
        churchName: data.ChurchName,
        appointmentDate: data.AppointmentDate,
        subServices,
      });
    } catch (err) {
      console.error('Error loading schedule details:', err);
      const message = err.response?.data?.error || err.response?.data?.message || 'Failed to load schedule details.';
      setScheduleError(message);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Preload sub-service urgency for approved/completed appointments so cards can show it
  useEffect(() => {
    const fetchUrgencyForAppointments = async () => {
      const idsToFetch = appointments
        .filter((apt) =>
          (apt.Status === 'Approved' || apt.Status === 'Completed') &&
          !appointmentUrgency[apt.AppointmentID]
        )
        .map((apt) => apt.AppointmentID);

      if (idsToFetch.length === 0) return;

      try {
        const responses = await Promise.all(
          idsToFetch.map((id) =>
            axios.get(`/api/appointments/${id}`).then((res) => ({ id, data: res.data || {} }))
          )
        );

        setAppointmentUrgency((prev) => {
          const updated = { ...prev };

          responses.forEach(({ id, data }) => {
            const subServices = data.formConfiguration?.sub_services || [];
            let nearest = null;

            subServices.forEach((sub) => {
              const schedule = sub.appointment_schedule;
              if (!schedule || !schedule.date || sub.isCompleted) return;
              const daysUntil = getDaysUntilDate(schedule.date);
              if (daysUntil === null || daysUntil < 0 || daysUntil > 3) return;

              if (!nearest || daysUntil < nearest.daysUntil) {
                nearest = {
                  name: sub.name,
                  daysUntil,
                };
              }
            });

            if (nearest) {
              updated[id] = {
                hasSubServiceUrgency: true,
                nearestSubServiceName: nearest.name,
                daysUntilSubService: nearest.daysUntil,
              };
            } else if (!updated[id]) {
              updated[id] = { hasSubServiceUrgency: false };
            }
          });

          return updated;
        });
      } catch (err) {
        console.error('Error loading sub-service urgency for appointments:', err);
      }
    };

    if (appointments.length > 0) {
      fetchUrgencyForAppointments();
    }
  }, [appointments, appointmentUrgency]);

  const isExpiringSoon = (appointment) => {
    if (appointment.Status !== 'Pending') return false;
    const hoursElapsed = getHoursElapsed(getCreatedAt(appointment));
    return hoursElapsed >= 72;
  };

  const formatRemainingTime = (hours) => {
    if (hours <= 0) return '0 hours';
    if (hours < 1) {
      const minutes = Math.floor(hours * 60);
      return `${minutes} minutes`;
    }
    return `${Math.floor(hours)} hours`;
  };

  return (
    <div className="lg:p-6 w-full h-screen pt-20">
      <div className="w-full h-full">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg h-full flex flex-col">
          <div className="p-6 bg-white border-b border-gray-200">
            <h1 className="text-2xl font-semibold text-gray-900">
              My Appointments
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              View and manage your sacrament appointment applications
            </p>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading appointments...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600 mb-4">
                  <FileText className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-lg font-medium">Failed to load appointments</p>
                  <p className="text-sm">{error}</p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No appointments yet
                </h3>
                <p className="text-gray-600 mb-6">
                  You haven't submitted any appointment applications yet.
                </p>
                <p className="text-sm text-gray-500">
                  Visit the Dashboard to browse churches and apply for sacraments.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {highlightedAppointmentId && (
                  <button
                    onClick={() => setHighlightedAppointmentId(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Clear Highlight
                  </button>
                )}
                {appointments.map((appointment) => {
                  const isExpiring = isExpiringSoon(appointment);
                  const remainingHours = getRemainingHours(getCreatedAt(appointment));
                  const daysUntilService = getDaysUntilDate(appointment.AppointmentDate);
                  const isServiceUrgent =
                    daysUntilService !== null &&
                    daysUntilService >= 0 &&
                    daysUntilService <= 3 &&
                    appointment.Status !== 'Completed';

                  const urgencyInfo = appointmentUrgency[appointment.AppointmentID] || {};
                  const hasSubServiceUrgency = urgencyInfo.hasSubServiceUrgency;
                  const daysUntilSubService = urgencyInfo.daysUntilSubService;
                  const nearestSubServiceName = urgencyInfo.nearestSubServiceName;

                  const hasAnyUrgency =
                    !isExpiring &&
                    appointment.Status === 'Approved' &&
                    (isServiceUrgent || hasSubServiceUrgency);
                  
                  return (
                    <div
                      key={appointment.AppointmentID}
                      ref={highlightedAppointmentId === appointment.AppointmentID ? highlightedRef : null}
                      className={`border rounded-lg p-6 transition-colors duration-300 ${
                        highlightedAppointmentId === appointment.AppointmentID
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300 animate-pulse'
                          : isExpiring
                            ? 'border-red-300 bg-red-50'
                            : hasAnyUrgency
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      {/* Expiration Warning Banner */}
                      {isExpiring && (
                        <div className="mb-4 bg-red-100 border border-red-300 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-red-900 mb-1">
                                ⚠️ Cancellation Warning - 72 Hours Exceeded
                              </h4>
                              <p className="text-sm text-red-800">
                                This appointment was requested more than 72 hours ago without approval. 
                                It may be automatically cancelled to free up the slot for other applicants.
                                Please contact the church if you need to maintain this reservation.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Time Remaining Indicator for Pending Appointments */}
                      {appointment.Status === 'Pending' && !isExpiring && (
                        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-sm text-amber-800">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">
                              Time remaining: {formatRemainingTime(remainingHours)}
                            </span>
                            <span className="text-amber-700">until 72-hour deadline</span>
                          </div>
                        </div>
                      )}

                      {/* Upcoming schedule urgency banner for approved appointments */}
                      {hasAnyUrgency && (
                        <div className="mb-4 bg-amber-100 border border-amber-300 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
                            <div className="text-sm text-amber-900">
                              <p className="font-semibold">Upcoming schedule reminder</p>
                              {hasSubServiceUrgency && nearestSubServiceName ? (
                                <p className="mt-0.5">
                                  <span className="font-medium">{nearestSubServiceName}</span>{' '}
                                  is happening in{' '}
                                  {daysUntilSubService === 0
                                    ? 'today'
                                    : daysUntilSubService === 1
                                    ? '1 day'
                                    : `${daysUntilSubService} days`}
                                  . Please make sure you attend and prepare any requirements.
                                </p>
                              ) : (
                                isServiceUrgent && (
                                  <p className="mt-0.5">
                                    Main service is happening in{' '}
                                    {daysUntilService === 0
                                      ? 'today'
                                      : daysUntilService === 1
                                      ? '1 day'
                                      : `${daysUntilService} days`}
                                    . Please be prepared.
                                  </p>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {appointment.ServiceName}
                              {appointment.SubServiceName && (
                                <span className="text-base font-normal text-gray-600"> - {appointment.SubServiceName}</span>
                              )}
                            </h3>
                            <span className={getStatusBadge(appointment.Status)}>
                              {appointment.Status}
                            </span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600 mb-1">
                            <MapPin className="w-4 h-4 mr-2" />
                            <span>{appointment.ChurchName}</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600 mb-1">
                            <Calendar className="w-4 h-4 mr-2" />
                            <span>
                              {new Date(appointment.AppointmentDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                          {appointment.StartTime && appointment.EndTime && (
                            <div className="flex items-center text-sm text-gray-600">
                              <Clock className="w-4 h-4 mr-2" />
                              <span>
                                {formatTime(appointment.StartTime)} - {formatTime(appointment.EndTime)}
                              </span>
                            </div>
                          )}
                        </div>

                        {(appointment.Status === 'Approved' || appointment.Status === 'Completed') && (
                          <div className="ml-6 flex items-center">
                            <button
                              onClick={() => handleViewScheduleDetails(appointment)}
                              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-full border border-blue-600 text-blue-600 bg-white hover:bg-blue-50 shadow-sm transition-colors cursor-pointer"
                            >
                              View Schedule details
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {appointment.ServiceDescription && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-600">{appointment.ServiceDescription}</p>
                        </div>
                      )}
                      
                      {appointment.Notes && (
                        <div className="bg-gray-50 rounded-md p-3">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">Notes:</h4>
                          <p className="text-sm text-gray-600">{appointment.Notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Details Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sub-service Schedule Details</h2>
                {scheduleDetails && (
                  <>
                    <p className="mt-1 text-sm text-gray-600">
                      {scheduleDetails.serviceName} at {scheduleDetails.churchName}
                    </p>
                    {(() => {
                      const days = scheduleDetails.appointmentDate ? getDaysUntilDate(scheduleDetails.appointmentDate) : null;
                      if (days === null || days < 0 || days > 3) return null;
                      return (
                        <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          <span>
                            {days === 0
                              ? 'Main service is today'
                              : days === 1
                              ? 'Main service is in 1 day'
                              : `Main service is in ${days} days`}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  setScheduleDetails(null);
                  setScheduleError(null);
                }}
                className="p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {scheduleLoading && (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-sm text-gray-600">Loading schedule...</span>
              </div>
            )}

            {!scheduleLoading && scheduleError && (
              <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {scheduleError}
              </div>
            )}

            {!scheduleLoading && !scheduleError && scheduleDetails && (
              <div className="space-y-4">
                {(!scheduleDetails.subServices || scheduleDetails.subServices.length === 0) && (
                  <p className="text-sm text-gray-600">No sub-services found for this appointment.</p>
                )}

                {scheduleDetails.subServices && scheduleDetails.subServices.length > 0 && (
                  <div className="space-y-3">
                    {scheduleDetails.subServices.map((sub) => {
                      const badgeClasses = sub.isCompleted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800';
                      const schedule = sub.appointment_schedule;
                      let scheduleDate = 'Not scheduled yet';
                      let scheduleTime = '';
                      let isUrgent = false;
                      let daysUntil = null;

                      if (schedule && schedule.date) {
                        const dateObj = new Date(schedule.date + 'T00:00:00');
                        if (!isNaN(dateObj.getTime())) {
                          // Format display date
                          scheduleDate = dateObj.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          });

                          // Urgency: within next 3 days and not yet completed
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const diffMs = dateObj.getTime() - today.getTime();
                          daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));
                          if (!sub.isCompleted && daysUntil >= 0 && daysUntil <= 3) {
                            isUrgent = true;
                          }
                        }
                        if (schedule.start_time && schedule.end_time) {
                          scheduleTime = `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`;
                        }
                      }

                      return (
                        <div key={sub.id} className="border border-gray-200 rounded-md p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900">{sub.name}</h3>
                              {sub.description && (
                                <p className="mt-0.5 text-xs text-gray-600">{sub.description}</p>
                              )}
                              <div className="mt-2 text-xs text-gray-700">
                                <span className="font-medium">Schedule:</span>{' '}
                                <span>{scheduleDate}</span>
                                {scheduleTime && <span>{' • '}{scheduleTime}</span>}
                              </div>

                              {isUrgent && (
                                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-medium">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  <span>
                                    {daysUntil === 0
                                      ? 'Happening today'
                                      : daysUntil === 1
                                      ? 'Happening in 1 day'
                                      : `Happening in ${daysUntil} days`}
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badgeClasses}`}>
                              {sub.isCompleted ? 'Completed' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AppointmentPage = () => {
  return (
    <Suspense fallback={
      <div className="lg:p-6 w-full h-screen pt-20">
        <div className="flex items-center justify-center h-full">
          <div>Loading...</div>
        </div>
      </div>
    }>
      <AppointmentContent />
    </Suspense>
  );
};

export default AppointmentPage;
