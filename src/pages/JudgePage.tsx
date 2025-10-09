import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getOrCreateJudge, getJudge, submitAnswer, getLatestSession } from '../lib/supabaseService';
import type { Question } from '../types';

// Predefined list of judge names
const JUDGE_NAMES = [
  'م. أحمد',
  'أ. مشعل',
  'أ. همام',
  'أ. سدير',
  'أ. حنين',
  'أ.د. نورة',
  'د. فريدة',
  'د. علي',
  'د. هشام'
];

export default function JudgePage() {
  const [sessionId, setSessionId] = useState<string>('لم تبدأ');
  const [judgeName, setJudgeName] = useState<string>('');
  const [judgeId, setJudgeId] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  
  const [currentTeam, setCurrentTeam] = useState<string>('لم يتم اختيار فريق');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: string }>({});
  const [judgeState, setJudgeState] = useState<'judging' | 'waiting'>('judging');

  useEffect(() => {
    checkExistingSession();
    fetchLatestSessionId();
    subscribeToSessionChanges();
  }, []);

  const fetchLatestSessionId = async () => {
    try {
      const latestSession = await getLatestSession();
      if (latestSession) {
        setSessionId(latestSession.session_id);
      }
    } catch (error) {
      console.error('Error fetching latest session:', error);
    }
  };

  const subscribeToSessionChanges = () => {
    console.log('Subscribing to session changes...');
    
    // Polling fallback - check for new sessions every 5 seconds
    const pollingInterval = setInterval(async () => {
      if (!isLoggedIn) {
        try {
          const latestSession = await getLatestSession();
          if (latestSession && latestSession.session_id !== sessionId) {
            setSessionId(latestSession.session_id);
            console.log('Polling: Updated to new session:', latestSession.session_id);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }
    }, 5000);

    // Try real-time subscription as well
    const sessionChannel = supabase
      .channel('sessions-monitor', {
        config: {
          broadcast: { self: false },
          presence: { key: '' }
        }
      })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sessions' },
        async (payload) => {
          console.log('Real-time: New session detected:', payload);
          
          if (!isLoggedIn) {
            const latestSession = await getLatestSession();
            if (latestSession) {
              setSessionId(latestSession.session_id);
              console.log('Real-time: Updated to new session:', latestSession.session_id);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Session monitor status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('Real-time subscription failed, using polling fallback');
        }
      });

    return () => {
      clearInterval(pollingInterval);
      sessionChannel.unsubscribe();
    };
  };

  useEffect(() => {
    if (isLoggedIn && sessionId !== 'لم تبدأ') {
      const cleanup = subscribeToQuestions();
      const validationInterval = startSessionValidation();
      
      return () => {
        cleanup?.();
        clearInterval(validationInterval);
      };
    }
  }, [isLoggedIn, sessionId]);

  // Auto-save team name whenever it changes
  useEffect(() => {
    if (currentTeam !== 'لم يتم اختيار فريق' && sessionId !== 'لم تبدأ' && isLoggedIn) {
      localStorage.setItem('currentTeam', currentTeam);
      localStorage.setItem(`currentTeam_${sessionId}`, currentTeam);
      console.log('🔄 Auto-saved team name:', currentTeam);
    }
  }, [currentTeam, sessionId, isLoggedIn]);

  const startSessionValidation = () => {
    // Poll every 2 seconds to check if session still exists
    const interval = setInterval(async () => {
      if (isLoggedIn && sessionId !== 'لم تبدأ') {
        try {
          const { data, error } = await supabase
            .from('sessions')
            .select('session_id, current_team_id')
            .eq('session_id', sessionId)
            .single();
          
          // Check if session was deleted or marked as completed
          if (error || !data || data.current_team_id === 'completed') {
            console.log('Session ended or completed, logging out...');
            handleSessionEnd();
          }
        } catch (error) {
          console.error('Session validation error:', error);
          // If there's an error fetching the session, it likely doesn't exist
          handleSessionEnd();
        }
      }
    }, 2000);
    
    return interval;
  };

  const checkExistingSession = () => {
    const savedSessionId = localStorage.getItem('judgeSessionId');
    const savedJudgeName = localStorage.getItem('judgeName');
    const savedJudgeToken = localStorage.getItem('judgeToken');

    if (savedSessionId && savedJudgeName && savedJudgeToken) {
      attemptRejoin(savedSessionId, savedJudgeName, savedJudgeToken);
    }
  };

  const loadPreviousAnswers = async (judgeId: string, sessionId: string, currentTeamId: string) => {
    try {
      const { data: answers, error } = await supabase
        .from('answers')
        .select('question_id, answer')
        .eq('judge_id', judgeId)
        .eq('session_id', sessionId)
        .eq('team_id', currentTeamId);
      
      if (error) throw error;
      
      if (answers && answers.length > 0) {
        const answersMap: { [key: string]: string } = {};
        answers.forEach(a => {
          answersMap[a.question_id] = a.answer;
        });
        setSelectedAnswers(answersMap);
        console.log('✅ Loaded previous answers:', answers.length);
      }
    } catch (error) {
      console.error('Error loading previous answers:', error);
    }
  };

  const loadCurrentQuestions = async (sessionId: string, judgeIdParam?: string) => {
    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('current_questions, current_team_id')
        .eq('session_id', sessionId)
        .single();
      
      if (error) throw error;
      
      if (session) {
        // ALWAYS set team name first, regardless of questions
        const teamName = session.current_team_id || 'لم يتم اختيار فريق';
        if (teamName !== 'لم يتم اختيار فريق') {
          setCurrentTeam(teamName);
          // Save to both general and session-specific localStorage
          localStorage.setItem('currentTeam', teamName);
          localStorage.setItem(`currentTeam_${sessionId}`, teamName);
          console.log('✅ Team name set and saved:', teamName);
        }
        
        // Then handle questions if they exist
        if (session.current_questions && session.current_questions.length > 0) {
          setQuestions(session.current_questions);
          console.log('✅ Loaded current questions on rejoin:', session.current_questions.length);
          
          // Load previous answers for this team
          // Use parameter if provided, otherwise fall back to state
          const effectiveJudgeId = judgeIdParam || judgeId;
          if (effectiveJudgeId && teamName !== 'لم يتم اختيار فريق') {
            await loadPreviousAnswers(effectiveJudgeId, sessionId, teamName);
          }
        } else {
          console.log('ℹ️ No current questions in session yet');
        }
      }
    } catch (error) {
      console.error('Error loading current questions:', error);
    }
  };

  const attemptRejoin = async (sessionId: string, name: string, token: string) => {
    try {
      const judge = await getJudge(name, token);
      
      if (judge && judge.session_id === sessionId) {
        setSessionId(sessionId);
        setJudgeName(name);
        setJudgeId(judge.id);
        setIsLoggedIn(true);
        
        // Load current questions from session if available
        // Pass judge.id directly to avoid race condition with state update
        await loadCurrentQuestions(sessionId, judge.id);
      } else {
        // Clear invalid session
        localStorage.removeItem('judgeSessionId');
        localStorage.removeItem('judgeName');
        localStorage.removeItem('judgeToken');
      }
    } catch (error) {
      console.error('Error rejoining:', error);
      localStorage.removeItem('judgeSessionId');
      localStorage.removeItem('judgeName');
      localStorage.removeItem('judgeToken');
    }
  };

  const subscribeToQuestions = () => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('broadcast', { event: 'new-questions' }, (payload: any) => {
        console.log('Received questions:', payload);
        setQuestions(payload.payload.questions || []);
        
        // Only update team if payload has a valid team name
        const newTeam = payload.payload.currentTeam;
        if (newTeam && newTeam !== 'لم يتم اختيار فريق') {
          setCurrentTeam(newTeam);
          localStorage.setItem('currentTeam', newTeam);
          localStorage.setItem(`currentTeam_${sessionId}`, newTeam);
          console.log('✅ Team updated from broadcast:', newTeam);
        } else {
          // Keep existing team - restore from localStorage if needed
          const savedTeam = localStorage.getItem(`currentTeam_${sessionId}`);
          if (savedTeam && savedTeam !== 'لم يتم اختيار فريق') {
            console.log('⚠️ Broadcast had no team, restoring from localStorage:', savedTeam);
            setCurrentTeam(savedTeam);
          }
        }
        
        setSelectedAnswers({});
        // Reset to judging state when new questions arrive
        setJudgeState('judging');
      })
      .subscribe();

    // Subscribe to session end
    const sessionChannel = supabase
      .channel(`session-end-${sessionId}`)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sessions', filter: `session_id=eq.${sessionId}` },
        () => {
          handleSessionEnd();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      sessionChannel.unsubscribe();
    };
  };

  const handleSessionEnd = () => {
    // Clean up session-specific data
    if (sessionId !== 'لم تبدأ') {
      localStorage.removeItem(`currentTeam_${sessionId}`);
    }
    
    localStorage.removeItem('judgeSessionId');
    localStorage.removeItem('judgeName');
    localStorage.removeItem('judgeToken');
    localStorage.removeItem('currentTeam');
    
    setSessionId('لم تبدأ');
    setIsLoggedIn(false);
    setQuestions([]);
    setCurrentTeam('لم يتم اختيار فريق');
    setSelectedAnswers({});
    
    alert('انتهت جلسة التحكيم. يرجى الانضمام لجلسة جديدة.');
  };

  const handleJoinGame = async () => {
    if (!judgeName.trim()) {
      alert('يرجى إدخال اسمك');
      return;
    }

    try {
      console.log('Attempting to join game...');
      
      // Fetch the latest active session
      const latestSession = await getLatestSession();
      console.log('Latest session:', latestSession);
      
      if (!latestSession) {
        alert('لا توجد جلسة نشطة حالياً. يرجى الانتظار حتى يبدأ المضيف جلسة جديدة.');
        return;
      }

      const newJudgeToken = crypto.randomUUID();
      
      console.log('Creating judge with:', {
        name: judgeName,
        session_id: latestSession.session_id
      });
      
      const judge = await getOrCreateJudge({
        name: judgeName,
        judge_token: newJudgeToken,
        session_id: latestSession.session_id
      });

      console.log('Judge joined successfully:', judge);

      setJudgeId(judge.id);
      setSessionId(latestSession.session_id);
      setIsLoggedIn(true);

      localStorage.setItem('judgeSessionId', latestSession.session_id);
      localStorage.setItem('judgeName', judgeName);
      localStorage.setItem('judgeToken', newJudgeToken);

      // Show success message
      setTimeout(() => {
        alert(`مرحباً ${judgeName}! تم الانضمام بنجاح للجلسة: ${latestSession.session_id}`);
      }, 100);
    } catch (error) {
      console.error('Error joining game:', error);
      alert('خطأ في الانضمام للجلسة');
    }
  };

  const calculatePoints = (question: Question, selectedAnswer: string): number => {
    // Find the question
    const choices = question.choices;
    
    // Handle both string[] and QuestionChoice[] formats
    let selectedWeight = 1;
    let maxWeight = 1;
    
    if (choices.length > 0 && typeof choices[0] === 'object') {
      // New format with weights
      const choiceObjects = choices as Array<{text: string; weight: number}>;
      const selectedChoice = choiceObjects.find(c => c.text === selectedAnswer);
      selectedWeight = selectedChoice?.weight || 0;
      maxWeight = Math.max(...choiceObjects.map(c => c.weight));
    } else {
      // Old format - all choices have equal weight
      selectedWeight = 1;
      maxWeight = 1;
    }
    
    // Apply the formula: points = (selectedOptionWeight / maxOptionWeight) * questionWeight
    const questionWeight = question.weight || 1;
    const points = (selectedWeight / maxWeight) * questionWeight;
    
    return Number(points.toFixed(2));
  };

  const handleAnswerSelect = async (questionId: string, answer: string) => {
    const previousAnswer = selectedAnswers[questionId];
    
    // If clicking the same answer, do nothing
    if (previousAnswer === answer) {
      console.log('ℹ️ Same answer selected, no change needed');
      return;
    }

    // Update local state first
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    // Find the question to calculate points
    const question = questions.find(q => q.id === questionId);
    if (!question) {
      console.error('Question not found:', questionId);
      return;
    }

    // Calculate points using the formula
    const points = calculatePoints(question, answer);
    
    try {
      // If there was a previous answer, delete it first
      if (previousAnswer) {
        console.log(`🔄 Changing answer from "${previousAnswer}" to "${answer}"`);
        
        const { error: deleteError } = await supabase
          .from('answers')
          .delete()
          .eq('judge_id', judgeId)
          .eq('question_id', questionId)
          .eq('team_id', currentTeam)
          .eq('session_id', sessionId);
        
        if (deleteError) {
          console.error('Error deleting old answer:', deleteError);
          throw deleteError;
        }
        
        console.log('✅ Old answer deleted');
      }

      // Submit new answer with calculated points
      await submitAnswer({
        answer,
        points,
        question_id: questionId,
        team_id: currentTeam,
        judge_id: judgeId,
        session_id: sessionId
      });
      
      console.log(`✅ New answer submitted with points: ${points}`);
    } catch (error) {
      console.error('Error updating answer:', error);
      // Revert local state on error
      setSelectedAnswers(prev => {
        if (previousAnswer) {
          // Restore previous answer
          return { ...prev, [questionId]: previousAnswer };
        } else {
          // Remove the failed answer
          const newState = { ...prev };
          delete newState[questionId];
          return newState;
        }
      });
    }
  };

  const handleSubmitFinal = async () => {
    const totalQuestions = questions.length;
    const answeredQuestions = Object.keys(selectedAnswers).length;
    
    // Check if no questions answered
    if (answeredQuestions === 0) {
      alert('يرجى الإجابة على جميع الأسئلة');
      return;
    }
    
    // Check if all questions are answered
    if (answeredQuestions < totalQuestions) {
      const unansweredCount = totalQuestions - answeredQuestions;
      alert(`يرجى الإجابة على جميع الأسئلة\nتم الإجابة على ${answeredQuestions} من ${totalQuestions}\nمتبقي ${unansweredCount} سؤال`);
      return;
    }

    // All answers are already submitted individually
    // Transition to waiting state
    setJudgeState('waiting');
    
    console.log(`✅ Submitted ${answeredQuestions} answers (all questions), now waiting for next team`);
  };

  if (!isLoggedIn) {
    return (
      <div style={{ 
        background: 'linear-gradient(135deg, #761814 0%, #5a120f 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{ width: '100%', maxWidth: '800px' }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            textAlign: 'center',
            animation: 'slideUp 0.5s ease-out'
          }}>
            <h1 style={{
              color: 'var(--primary-color)',
              fontSize: '32px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}>
              <span>⚖️</span>
              الانضمام للتحكيم
            </h1>
            <p style={{
              color: 'var(--text-secondary)',
              marginBottom: '32px',
              fontSize: '16px'
            }}>
              أدخل اسمك للانضمام إلى جلسة التحكيم
            </p>
            
            <div style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-color)',
              padding: '12px 20px',
              borderRadius: '12px',
              marginBottom: '24px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>معرف الجلسة:</span>
              <span>{sessionId}</span>
            </div>

            <div style={{ marginBottom: '20px', textAlign: 'right' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                fontSize: '14px'
              }}>
                اختر اسمك
              </label>
              <select
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '16px',
                  background: 'white',
                  cursor: 'pointer',
                  color: judgeName ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                <option value="" disabled>-- اختر اسمك من القائمة --</option>
                {JUDGE_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <button className="btn btn-primary" onClick={handleJoinGame} style={{ width: '100%' }}>
              <span>🚀</span>
              انضمام للجلسة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #761814 0%, #5a120f 100%)',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          animation: 'slideUp 0.5s ease-out'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))',
            color: 'white',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>يتم تحكيم</h2>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{currentTeam}</div>
          </div>

          <div id="questions-container">
            {judgeState === 'waiting' ? (
              // Waiting Screen
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                animation: 'fadeIn 0.5s ease-out'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '24px',
                  borderRadius: '16px',
                  marginBottom: '32px',
                  boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)'
                }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
                  <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
                    تم إرسال إجاباتك بنجاح!
                  </h2>
                  <p style={{ fontSize: '16px', opacity: 0.9 }}>
                    شكراً لك على مشاركتك في التحكيم
                  </p>
                </div>

                <div style={{
                  background: 'var(--secondary-light)',
                  padding: '32px',
                  borderRadius: '12px'
                }}>
                  <div style={{
                    width: '80px',
                    height: '80px',
                    border: '6px solid var(--primary-color)',
                    borderTop: '6px solid transparent',
                    borderRadius: '50%',
                    margin: '0 auto 24px',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '12px'
                  }}>
                    ⏳ في انتظار الفريق التالي...
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)'
                  }}>
                    سيتم عرض الأسئلة الجديدة تلقائياً عندما يرسلها المضيف
                  </p>
                </div>

                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              </div>
            ) : questions.length === 0 ? (
              <div className="empty-state">في انتظار الأسئلة...</div>
            ) : (
              questions.map((question, index) => (
                <div key={question.id} style={{
                  background: 'var(--secondary-light)',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '20px',
                  borderRight: '4px solid var(--primary-color)'
                }}>
                  <div style={{
                    display: 'inline-block',
                    background: 'var(--primary-color)',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px'
                  }}>
                    السؤال {index + 1}
                  </div>
                  
                  <div style={{
                    fontSize: '18px',
                    color: 'var(--text-primary)',
                    marginBottom: '20px',
                    fontWeight: 500
                  }}>
                    {question.text}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px'
                  }}>
                    {question.choices.map((choice, choiceIdx) => {
                      const choiceText = typeof choice === 'string' ? choice : choice.text;
                      const choiceWeight = typeof choice === 'string' ? 1 : choice.weight;
                      const isSelected = selectedAnswers[question.id] === choiceText;
                      
                      return (
                        <button
                          key={choiceIdx}
                          className={`answer-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleAnswerSelect(question.id, choiceText)}
                          style={{
                            padding: '14px 20px',
                            background: isSelected ? 'var(--primary-color)' : 'white',
                            color: isSelected ? 'white' : 'var(--text-primary)',
                            border: `2px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 500,
                            textAlign: 'center',
                            position: 'relative',
                            transition: 'all 0.2s',
                            opacity: isSelected ? 1 : 0.9
                          }}
                        >
                          <div>{choiceText}</div>
                          {typeof choice !== 'string' && (
                            <div style={{
                              fontSize: '11px',
                              marginTop: '4px',
                              opacity: 0.8
                            }}>
                              وزن: {choiceWeight}
                            </div>
                          )}
                          {isSelected && (
                            <span style={{
                              position: 'absolute',
                              top: '8px',
                              left: '8px',
                              background: 'white',
                              color: 'var(--primary-color)',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}>
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {questions.length > 0 && judgeState === 'judging' && (
            <>
              {/* Progress Indicator */}
              <div style={{
                marginTop: '24px',
                padding: '16px',
                background: Object.keys(selectedAnswers).length === questions.length 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'var(--secondary-light)',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: Object.keys(selectedAnswers).length === questions.length 
                    ? 'white'
                    : 'var(--text-secondary)',
                  marginBottom: '8px'
                }}>
                  {Object.keys(selectedAnswers).length === questions.length 
                    ? '✅ تم الإجابة على جميع الأسئلة'
                    : `تم الإجابة على ${Object.keys(selectedAnswers).length} من ${questions.length} أسئلة`
                  }
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(0,0,0,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(Object.keys(selectedAnswers).length / questions.length) * 100}%`,
                    height: '100%',
                    background: Object.keys(selectedAnswers).length === questions.length 
                      ? 'white'
                      : 'var(--primary-color)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              <button
                className="btn btn-success"
                onClick={handleSubmitFinal}
                style={{
                  marginTop: '16px',
                  background: 'linear-gradient(135deg, var(--success-color), #059669)',
                  fontSize: '18px',
                  padding: '16px 40px',
                  boxShadow: 'var(--shadow-lg)',
                  width: '100%',
                  opacity: Object.keys(selectedAnswers).length === questions.length ? 1 : 0.7,
                  cursor: Object.keys(selectedAnswers).length === questions.length ? 'pointer' : 'not-allowed'
                }}
              >
                <span>📤</span>
                إرسال الإجابات النهائية
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
