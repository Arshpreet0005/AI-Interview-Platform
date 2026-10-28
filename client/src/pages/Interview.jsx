import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import api from "../services/api";

const FACE_NO_FACE_ALERT_MS = 5000;

const Interview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const detectorRef = useRef(null);
    const faceLossStartRef = useRef(null);
    const multipleFacesStartRef = useRef(null);
    const activeIssueRef = useRef(null);
    const proctoringBufferRef = useRef([]);
    const monitorLoopRef = useRef(null);

    const [interview, setInterview] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answer, setAnswer] = useState("");
    const [followUpMode, setFollowUpMode] = useState(false);
    const [followUpQuestion, setFollowUpQuestion] = useState("");
    const [followUpAnswer, setFollowUpAnswer] = useState("");
    const [followUpQuestionIndex, setFollowUpQuestionIndex] = useState(null);

    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
    const [completing, setCompleting] = useState(false);

    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [cameraStatus, setCameraStatus] = useState("Camera Disabled");
    const [cameraError, setCameraError] = useState("");
    const [faceStatus, setFaceStatus] = useState("Waiting for camera");
    const [alertMessage, setAlertMessage] = useState("");
    const [proctoringEvents, setProctoringEvents] = useState([]);
    const noFaceAlertedRef = useRef(false);
    const multipleFacesAlertedRef = useRef(false);

    const [error, setError] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [voiceStatus, setVoiceStatus] = useState("Voice input ready");
    const [voiceError, setVoiceError] = useState("");
    const recognitionRef = useRef(null);

    const applyVoiceText = (text) => {
        const sanitizedText = text || "";

        if (isFollowUpQuestion) {
            setFollowUpAnswer(sanitizedText);
            return;
        }

        setAnswer(sanitizedText);
    };

    const stopVoiceRecognition = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        setIsListening(false);
        setVoiceStatus("Voice input ready");
    };

    const startVoiceRecognition = async () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setVoiceError("Speech recognition is not supported in this browser. Please use the text answer box instead.");
            setVoiceStatus("Voice input unavailable");
            return;
        }

        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (permissionError) {
            setVoiceError("Microphone permission was denied. Please allow microphone access and try again.");
            setVoiceStatus("Permission denied");
            return;
        }

        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognitionRef.current = recognition;

        recognition.onstart = () => {
            setIsListening(true);
            setVoiceError("");
            setVoiceStatus("Listening... speak now");
        };

        recognition.onresult = (event) => {
            let transcript = "";

            for (let i = 0; i < event.results.length; i += 1) {
                transcript += event.results[i][0].transcript;
            }

            const finalTranscript = transcript.trim();

            if (!finalTranscript) {
                setVoiceError("No speech detected. Please try again.");
                return;
            }

            applyVoiceText(finalTranscript);
            setVoiceStatus("Transcript captured. Review and edit before submitting.");
        };

        recognition.onerror = (event) => {
            const errorMessage = event.error === "not-allowed"
                ? "Microphone access was denied. Please allow microphone permission and try again."
                : event.error === "no-speech"
                    ? "No speech was detected. Please try again."
                    : "Voice recognition encountered an issue. Please try again.";

            setVoiceError(errorMessage);
            setVoiceStatus("Voice input unavailable");
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            setVoiceStatus((current) => (
                current === "Listening... speak now" ? "Voice input ready" : current
            ));
        };

        recognition.start();
    };

    const addProctoringEvent = (eventType, details = "", duration = 0) => {
        const event = {
            eventType,
            details,
            duration,
            timestamp: new Date().toISOString(),
        };

        setProctoringEvents((prev) => [...prev, event]);
        proctoringBufferRef.current.push(event);

        if (proctoringBufferRef.current.length >= 1) {
            api.post(`/interviews/${id}/proctoring`, {
                events: proctoringBufferRef.current,
            }).catch(() => {
                // Intentionally ignore storage errors so the interview can continue.
            });
            proctoringBufferRef.current = [];
        }
    };

    const stopCamera = () => {
        if (monitorLoopRef.current) {
            cancelAnimationFrame(monitorLoopRef.current);
            monitorLoopRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setCameraEnabled(false);
        setCameraStatus("Camera Disabled");
        setFaceStatus("Camera disabled");
        setAlertMessage("Camera is disabled. Please enable your camera to continue proctoring.");
        addProctoringEvent("camera_disabled", "Camera turned off during interview.");
    };

    const setupFaceDetector = async () => {
        if (detectorRef.current) {
            return;
        }

        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        detectorRef.current = await FaceDetector.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
            minSuppressionThreshold: 0.3,
        });
    };

    const startCamera = async () => {
        try {
            setCameraError("");
            setCameraStatus("Starting camera...");

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("This browser does not support camera access.");
            }

            await setupFaceDetector();

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false,
            });

            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraEnabled(true);
            setCameraStatus("Camera Active");
            setFaceStatus("Monitoring face visibility");
            setAlertMessage("");
        } catch (error) {
            setCameraEnabled(false);
            setCameraStatus("Camera Disabled");
            setFaceStatus("Camera unavailable");

            if (error.name === "NotAllowedError") {
                setCameraError("Camera permission was denied. Please allow camera access to enable proctoring.");
                addProctoringEvent("camera_permission_denied", "Camera access was denied by the browser.");
            } else if (error.name === "NotFoundError") {
                setCameraError("No camera was found on this device.");
                addProctoringEvent("camera_unavailable", "No camera was detected by the browser.");
            } else {
                setCameraError(error.message || "Unable to access the camera.");
            }
        }
    };

    const monitorFace = async () => {
        if (!videoRef.current || !detectorRef.current || !cameraEnabled) {
            return;
        }

        const video = videoRef.current;

        if (video.readyState >= 2) {
            const detectionResult = detectorRef.current.detectForVideo(video, performance.now());
            const detectionCount = detectionResult?.detections?.length || 0;

            if (detectionCount > 1) {
                if (!multipleFacesAlertedRef.current) {
                    multipleFacesStartRef.current = Date.now();
                    activeIssueRef.current = "multiple_faces";
                    multipleFacesAlertedRef.current = true;
                    setFaceStatus("Multiple faces detected");
                    setAlertMessage("Multiple faces detected. Please ensure you are interviewing alone.");
                    addProctoringEvent("multiple_faces", "More than one face detected in the camera frame.");
                }
            } else if (detectionCount === 0) {
                if (!faceLossStartRef.current) {
                    faceLossStartRef.current = Date.now();
                    activeIssueRef.current = "face_not_detected";
                    setFaceStatus("No face detected");
                    setAlertMessage("Face not detected. Please stay in front of the camera.");
                }

                const elapsed = Date.now() - faceLossStartRef.current;
                if (elapsed >= FACE_NO_FACE_ALERT_MS && !noFaceAlertedRef.current) {
                    noFaceAlertedRef.current = true;
                    addProctoringEvent("face_not_detected", `No face detected for ${elapsed} ms.`, elapsed);
                }
            } else {
                if (activeIssueRef.current === "face_not_detected") {
                    const duration = Date.now() - (faceLossStartRef.current || Date.now());
                    if (noFaceAlertedRef.current && duration >= FACE_NO_FACE_ALERT_MS) {
                        addProctoringEvent("face_not_detected", "Face returned after a no-face event.", duration);
                    }
                    noFaceAlertedRef.current = false;
                    faceLossStartRef.current = null;
                }

                if (activeIssueRef.current === "multiple_faces") {
                    const duration = Date.now() - (multipleFacesStartRef.current || Date.now());
                    if (multipleFacesAlertedRef.current) {
                        addProctoringEvent("multiple_faces", "Multiple-face condition ended.", duration);
                    }
                    multipleFacesAlertedRef.current = false;
                    multipleFacesStartRef.current = null;
                }

                activeIssueRef.current = null;
                setFaceStatus("Face detected");
                setAlertMessage("");
            }
        }

        monitorLoopRef.current = requestAnimationFrame(monitorFace);
    };

    const fetchInterview = async () => {
        try {
            const response = await api.get(`/interviews/${id}`);

            setInterview(response.data.interview);
        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to load interview"
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInterview();
    }, [id]);

    useEffect(() => {
        if (!interview || !interview.questions || interview.questions.length === 0) {
            return undefined;
        }

        startCamera();

        return () => {
            if (monitorLoopRef.current) {
                cancelAnimationFrame(monitorLoopRef.current);
            }

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, [interview?._id, interview?.questions?.length]);

    useEffect(() => {
        if (cameraEnabled && videoRef.current && detectorRef.current) {
            monitorLoopRef.current = requestAnimationFrame(monitorFace);
        }

        return () => {
            if (monitorLoopRef.current) {
                cancelAnimationFrame(monitorLoopRef.current);
                monitorLoopRef.current = null;
            }
        };
    }, [cameraEnabled]);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
        };
    }, []);

    const generateQuestions = async () => {
        try {
            setGenerating(true);
            setError("");

            const response = await api.post(
                `/interviews/${id}/generate`
            );

            setInterview(response.data.interview);
            setCurrentIndex(0);
            setAnswer("");

        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to generate questions"
            );
        } finally {
            setGenerating(false);
        }
    };

    const submitCurrentAnswer = async (isFinalQuestion = false) => {
        if (!answer.trim()) {
            setError("Please enter an answer before continuing.");
            return;
        }

        try {
            setSubmitting(true);
            setError("");

            const response = await api.post(
                `/interviews/${id}/answer`,
                {
                    questionIndex: currentIndex,
                    answer,
                }
            );

            const nextFollowUpQuestion = response.data?.followUpQuestion;

            if (nextFollowUpQuestion) {
                setFollowUpQuestion(nextFollowUpQuestion);
                setFollowUpQuestionIndex(currentIndex);
                setFollowUpAnswer("");
                setFollowUpMode(true);
                setAnswer("");
                return;
            }

            if (isFinalQuestion) {
                await completeInterview();
                return;
            }

            if (currentIndex < interview.questions.length - 1) {
                const nextIndex = currentIndex + 1;

                setCurrentIndex(nextIndex);
                setAnswer(interview.questions[nextIndex].answer || "");
            }

        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to submit answer"
            );
        } finally {
            setSubmitting(false);
        }
    };

    const submitFollowUpAnswer = async () => {
        if (!followUpAnswer.trim()) {
            setError("Please answer the follow-up question before continuing.");
            return;
        }

        try {
            setFollowUpSubmitting(true);
            setError("");

            await api.post(
                `/interviews/${id}/follow-up-answer`,
                {
                    questionIndex: followUpQuestionIndex ?? currentIndex,
                    answer: followUpAnswer,
                    followUpQuestion,
                }
            );

            if (currentIndex === interview.questions.length - 1) {
                await completeInterview();
                return;
            }

            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            setAnswer(interview.questions[nextIndex].answer || "");
            setFollowUpMode(false);
            setFollowUpQuestion("");
            setFollowUpAnswer("");
            setFollowUpQuestionIndex(null);
        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to submit follow-up answer"
            );
        } finally {
            setFollowUpSubmitting(false);
        }
    };

    const completeInterview = async () => {
        try {
            setCompleting(true);
            setError("");

            if (streamRef.current) {
                stopCamera();
            }

            const response = await api.post(
                `/interviews/${id}/complete`
            );

            navigate(`/interview/${id}/result`, {
                state: {
                    report: response.data.report
                }
            });

        } catch (error) {
            setError(
                error.response?.data?.message ||
                "Failed to complete interview"
            );
        } finally {
            setCompleting(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading">
                    Loading interview...
                </div>
            </div>
        );
    }

    if (error && !interview) {
        return (
            <div className="page-container">
                <div className="error-message">
                    {error}
                </div>
            </div>
        );
    }

    if (!interview) {
        return (
            <div className="page-container">
                <p>Interview not found.</p>
            </div>
        );
    }

    /*
     * No questions yet
     */
    if (
        !interview.questions ||
        interview.questions.length === 0
    ) {
        return (
            <div className="page-container">

                <div className="interview-intro">

                    <h1>{interview.role} Interview</h1>

                    <p>
                        {interview.experience} years experience
                    </p>

                    <div className="tech-stack">
                        {interview.techStack.map(
                            (tech, index) => (
                                <span
                                    className="tech-tag"
                                    key={index}
                                >
                                    {tech}
                                </span>
                            )
                        )}
                    </div>

                    {interview.description && (
                        <p>
                            {interview.description}
                        </p>
                    )}

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={generateQuestions}
                        disabled={generating}
                    >
                        {generating
                            ? "Generating Questions..."
                            : "Start AI Interview"}
                    </button>

                </div>

            </div>
        );
    }

    const question = interview.questions[currentIndex];
    const isFollowUpQuestion = followUpMode && !!followUpQuestion;
    const activeQuestionText = isFollowUpQuestion ? followUpQuestion : question.question;
    const activeAnswerValue = isFollowUpQuestion ? followUpAnswer : answer;
    const activeAnswerSetter = isFollowUpQuestion ? setFollowUpAnswer : setAnswer;
    const activeQuestionLabel = isFollowUpQuestion ? "Follow-up Question" : `Question ${currentIndex + 1}`;

    const isLastQuestion =
        currentIndex === interview.questions.length - 1;

    const progress =
        ((currentIndex + 1) /
            interview.questions.length) *
        100;

    return (
        <div className="page-container">

            <div className="interview-header">

                <div>
                    <h1>{interview.role} Interview</h1>

                    <p>
                        {interview.techStack.join(" • ")}
                    </p>
                </div>

                <div className="question-counter">
                    Question {currentIndex + 1} of{" "}
                    {interview.questions.length}
                </div>

            </div>

            {/* Progress Bar */}

            <div className="progress-container">

                <div
                    className="progress-bar"
                    style={{
                        width: `${progress}%`
                    }}
                />

            </div>

            <div className="proctoring-layout">
                <div className="camera-panel">
                    <div className="camera-header">
                        <h3>Camera Monitoring</h3>
                        <span className={cameraEnabled ? "camera-status active" : "camera-status disabled"}>
                            {cameraStatus}
                        </span>
                    </div>

                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="camera-video"
                    />

                    <div className="camera-controls">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                                if (cameraEnabled) {
                                    stopCamera();
                                } else {
                                    startCamera();
                                }
                            }}
                        >
                            {cameraEnabled ? "Disable Camera" : "Enable Camera"}
                        </button>
                    </div>

                    <div className="camera-meta">
                        <strong>Face Detection:</strong> {faceStatus}
                    </div>

                    {cameraError && (
                        <div className="proctoring-alert error">
                            {cameraError}
                        </div>
                    )}

                    {alertMessage && (
                        <div className="proctoring-alert warning">
                            {alertMessage}
                        </div>
                    )}
                </div>

                <div className="question-panel">
                    <div className="question-card">
                        <span className={`question-label ${isFollowUpQuestion ? "follow-up-label" : ""}`}>
                            {activeQuestionLabel}
                        </span>

                        {isFollowUpQuestion && (
                            <div className="follow-up-banner">
                                Follow-up based on your previous answer
                            </div>
                        )}

                        <h2>
                            {activeQuestionText}
                        </h2>
                    </div>

                    <div className="answer-section">
                        <div className="answer-header-row">
                            <label>
                                {isFollowUpQuestion ? "Your Follow-up Answer" : "Your Answer"}
                            </label>

                            <div className="voice-controls">
                                <button
                                    type="button"
                                    className={`voice-toggle-btn ${isListening ? "recording" : ""}`}
                                    onClick={() => {
                                        if (isListening) {
                                            stopVoiceRecognition();
                                            return;
                                        }

                                        startVoiceRecognition();
                                    }}
                                    disabled={submitting || completing || followUpSubmitting}
                                >
                                    {isListening ? "Stop" : "🎙️ Mic"}
                                </button>
                            </div>
                        </div>

                        <textarea
                            value={activeAnswerValue}
                            onChange={(e) => activeAnswerSetter(e.target.value)}
                            placeholder={isFollowUpQuestion ? "Type your follow-up answer here..." : "Type your answer here..."}
                            rows="10"
                            disabled={submitting || completing || followUpSubmitting}
                        />

                        <div className="voice-status-row">
                            <span className={`voice-status ${isListening ? "active" : ""}`}>
                                {voiceStatus}
                            </span>
                            {voiceError && (
                                <span className="voice-error">{voiceError}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            {proctoringEvents.length > 0 && (
                <div className="proctoring-mini-summary">
                    <strong>Latest observation:</strong> {proctoringEvents[proctoringEvents.length - 1].eventType}
                </div>
            )}

            {isFollowUpQuestion ? (
                <button
                    className="btn btn-primary"
                    onClick={submitFollowUpAnswer}
                    disabled={followUpSubmitting || completing}
                >
                    {followUpSubmitting
                        ? "Submitting Follow-up..."
                        : "Submit Follow-up Answer"}
                </button>
            ) : !isLastQuestion ? (
                <button
                    className="btn btn-primary"
                    onClick={() => submitCurrentAnswer(false)}
                    disabled={submitting || completing}
                >
                    {submitting
                        ? "Saving Answer..."
                        : "Submit & Next"}
                </button>
            ) : (
                <button
                    className="btn btn-primary"
                    onClick={() => submitCurrentAnswer(true)}
                    disabled={submitting || completing}
                >
                    {completing
                        ? "Generating Report..."
                        : "Finish Interview"}
                </button>
            )}

        </div>
    );
};

export default Interview;