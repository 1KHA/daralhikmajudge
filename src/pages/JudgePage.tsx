import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createJudge, getJudge, submitAnswer, getLatestSession } from '../lib/supabaseService';
import type { Question } from '../types';

export default function JudgePage() {
  const [sessionId, setSessionId] = useState<string>('لم تبدأ');
  const [judgeName, setJudgeName] = useState<string>('');
  const [judgeId, setJudgeId] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  
  const [currentTeam, setCurrentTeam] = useState<string>('لم يتم اختيار فريق');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: string }>({});
  const [judgeState, setJudgeState] = useState<'judging' | 'waiting'>('judging');
  const [submittedCount, setSubmittedCount] = useState<number>(0);

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

  const attemptRejoin = async (sessionId: string, name: string, token: string) => {
    try {
      const judge = await getJudge(name, token);
      
      if (judge && judge.session_id === sessionId) {
        setSessionId(sessionId);
        setJudgeName(name);
        setJudgeId(judge.id);
        setIsLoggedIn(true);
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
        setCurrentTeam(payload.payload.currentTeam || 'لم يتم اختيار فريق');
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
    localStorage.removeItem('judgeSessionId');
    localStorage.removeItem('judgeName');
    localStorage.removeItem('judgeToken');
    
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
      
      const judge = await createJudge({
        name: judgeName,
        judge_token: newJudgeToken,
        session_id: latestSession.session_id
      });

      console.log('Judge created successfully:', judge);

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
    
    console.log(`Calculated points for answer "${answer}":`, points);

    // Submit answer immediately with calculated points
    try {
      await submitAnswer({
        answer,
        points,
        question_id: questionId,
        team_id: currentTeam,
        judge_id: judgeId,
        session_id: sessionId
      });
      
      console.log('✅ Answer submitted with points:', points);
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const handleSubmitFinal = async () => {
    if (Object.keys(selectedAnswers).length === 0) {
      alert('يرجى الإجابة على سؤال واحد على الأقل');
      return;
    }

    // All answers are already submitted individually
    const count = Object.keys(selectedAnswers).length;
    setSubmittedCount(count);
    
    // Transition to waiting state
    setJudgeState('waiting');
    
    console.log(`✅ Submitted ${count} answers, now waiting for next team`);
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
                اسمك الكامل
              </label>
              <input
                type="text"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                placeholder="أدخل اسمك هنا"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              />
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
                  borderRadius: '12px',
                  marginBottom: '24px'
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
                    color: 'var(--text-secondary)',
                    marginBottom: '20px'
                  }}>
                    سيتم عرض الأسئلة الجديدة تلقائياً عندما يرسلها المضيف
                  </p>
                </div>

                <div style={{
                  background: 'white',
                  border: '2px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'inline-block'
                }}>
                  <div style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px'
                  }}>
                    📊 عدد الإجابات المرسلة
                  </div>
                  <div style={{
                    fontSize: '36px',
                    fontWeight: 700,
                    color: 'var(--primary-color)'
                  }}>
                    {submittedCount}
                  </div>
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
                          disabled={isSelected}
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
                            transition: 'all 0.2s'
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
            <button
              className="btn btn-success"
              onClick={handleSubmitFinal}
              style={{
                marginTop: '32px',
                background: 'linear-gradient(135deg, var(--success-color), #059669)',
                fontSize: '18px',
                padding: '16px 40px',
                boxShadow: 'var(--shadow-lg)',
                width: '100%'
              }}
            >
              <span>📤</span>
              إرسال الإجابات النهائية
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
