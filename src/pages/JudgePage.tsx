import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createJudge, getJudge, submitAnswer } from '../lib/supabaseService';
import type { Question } from '../types';

export default function JudgePage() {
  const [sessionId, setSessionId] = useState<string>('لم تبدأ');
  const [judgeName, setJudgeName] = useState<string>('');
  const [judgeId, setJudgeId] = useState<string>('');
  const [judgeToken, setJudgeToken] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  
  const [currentTeam, setCurrentTeam] = useState<string>('لم يتم اختيار فريق');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    checkExistingSession();
  }, []);

  useEffect(() => {
    if (isLoggedIn && sessionId !== 'لم تبدأ') {
      subscribeToQuestions();
    }
  }, [isLoggedIn, sessionId]);

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
        setJudgeToken(token);
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
      const newJudgeToken = crypto.randomUUID();
      const defaultSessionId = '1234'; // Default PIN
      
      const judge = await createJudge({
        name: judgeName,
        judge_token: newJudgeToken,
        session_id: defaultSessionId
      });

      setJudgeId(judge.id);
      setJudgeToken(newJudgeToken);
      setSessionId(defaultSessionId);
      setIsLoggedIn(true);

      localStorage.setItem('judgeSessionId', defaultSessionId);
      localStorage.setItem('judgeName', judgeName);
      localStorage.setItem('judgeToken', newJudgeToken);

      // Show success message
      setTimeout(() => {
        alert(`مرحباً ${judgeName}! تم الانضمام بنجاح`);
      }, 100);
    } catch (error) {
      console.error('Error joining game:', error);
      alert('خطأ في الانضمام للجلسة');
    }
  };

  const handleAnswerSelect = async (questionId: string, answer: string) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    // Submit answer immediately
    try {
      await submitAnswer({
        answer,
        question_id: questionId,
        team_id: currentTeam,
        judge_id: judgeId,
        session_id: sessionId
      });
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
    alert('تم إرسال الإجابات بنجاح!');
  };

  if (!isLoggedIn) {
    return (
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
            {questions.length === 0 ? (
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
                    {question.choices.map((choice, choiceIdx) => (
                      <button
                        key={choiceIdx}
                        className={`answer-btn ${selectedAnswers[question.id] === choice ? 'selected' : ''}`}
                        onClick={() => handleAnswerSelect(question.id, choice)}
                        disabled={selectedAnswers[question.id] === choice}
                        style={{
                          padding: '14px 20px',
                          background: selectedAnswers[question.id] === choice ? 'var(--primary-color)' : 'white',
                          color: selectedAnswers[question.id] === choice ? 'white' : 'var(--text-primary)',
                          border: `2px solid ${selectedAnswers[question.id] === choice ? 'var(--primary-color)' : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '16px',
                          fontWeight: 500,
                          textAlign: 'center',
                          position: 'relative',
                          transition: 'all 0.2s'
                        }}
                      >
                        {choice}
                        {selectedAnswers[question.id] === choice && (
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
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {questions.length > 0 && (
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
