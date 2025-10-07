import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getQuestions } from '../lib/supabaseService';
import type { Question } from '../types';

interface Choice {
  text: string;
  weight: number;
}

interface QuestionData {
  text: string;
  choices: Choice[];
}

interface Section {
  id: number;
  name: string;
  weight: number;
  questions: QuestionData[];
}

export default function QuestionsPage() {
  const navigate = useNavigate();
  const [existingQuestions, setExistingQuestions] = useState<Question[]>([]);
  const [bankName, setBankName] = useState('');
  const [totalPoints, setTotalPoints] = useState(100);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExisting, setShowExisting] = useState(true);

  useEffect(() => {
    loadData();
    // Initialize with one section
    addSection();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const questionsData = await getQuestions();
      setExistingQuestions(questionsData);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const addSection = () => {
    const sectionId = Date.now();
    const section: Section = {
      id: sectionId,
      name: `القسم ${sections.length + 1}`,
      weight: 1,
      questions: []
    };
    setSections([...sections, section]);
  };

  const removeSection = (sectionId: number) => {
    setSections(sections.filter(s => s.id !== sectionId));
  };

  const updateSectionName = (sectionId: number, name: string) => {
    setSections(sections.map(s => s.id === sectionId ? { ...s, name } : s));
  };

  const updateSectionWeight = (sectionId: number, weight: number) => {
    setSections(sections.map(s => s.id === sectionId ? { ...s, weight } : s));
  };

  const addQuestion = (sectionId: number) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: [...s.questions, {
            text: '',
            choices: [
              { text: '', weight: 1 },
              { text: '', weight: 1 }
            ]
          }]
        };
      }
      return s;
    }));
  };

  const removeQuestion = (sectionId: number, questionIndex: number) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        newQuestions.splice(questionIndex, 1);
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const updateQuestionText = (sectionId: number, questionIndex: number, text: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        newQuestions[questionIndex] = { ...newQuestions[questionIndex], text };
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const updateChoice = (sectionId: number, questionIndex: number, choiceIndex: number, text: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        const newChoices = [...newQuestions[questionIndex].choices];
        newChoices[choiceIndex] = { ...newChoices[choiceIndex], text };
        newQuestions[questionIndex] = { ...newQuestions[questionIndex], choices: newChoices };
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const updateChoiceWeight = (sectionId: number, questionIndex: number, choiceIndex: number, weight: number) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        const newChoices = [...newQuestions[questionIndex].choices];
        newChoices[choiceIndex] = { ...newChoices[choiceIndex], weight };
        newQuestions[questionIndex] = { ...newQuestions[questionIndex], choices: newChoices };
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const addChoice = (sectionId: number, questionIndex: number) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        newQuestions[questionIndex].choices.push({ text: '', weight: 1 });
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const removeChoice = (sectionId: number, questionIndex: number) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQuestions = [...s.questions];
        if (newQuestions[questionIndex].choices.length > 1) {
          newQuestions[questionIndex].choices.pop();
        }
        return { ...s, questions: newQuestions };
      }
      return s;
    }));
  };

  const calculatePointsDistribution = () => {
    const totalWeight = sections.reduce((sum, section) => sum + section.weight, 0);
    return sections.map(section => {
      const sectionPoints = (section.weight / totalWeight) * totalPoints;
      const pointsPerQuestion = section.questions.length > 0 
        ? sectionPoints / section.questions.length 
        : 0;
      
      return {
        name: section.name,
        weight: section.weight,
        questionCount: section.questions.length,
        totalPoints: sectionPoints.toFixed(2),
        pointsPerQuestion: pointsPerQuestion.toFixed(2)
      };
    });
  };

  const saveQuestions = async () => {
    if (sections.length === 0) {
      alert('يرجى إضافة قسم واحد على الأقل مع الأسئلة');
      return;
    }

    if (!bankName.trim()) {
      alert('يرجى إدخال اسم بنك الأسئلة');
      return;
    }

    // Validate questions
    let hasInvalid = false;
    let errorMsg = '';

    sections.forEach((section, sIdx) => {
      section.questions.forEach((question, qIdx) => {
        if (!question.text || !question.text.trim()) {
          hasInvalid = true;
          errorMsg += `القسم ${sIdx + 1}، السؤال ${qIdx + 1}: نص السؤال مفقود.\n`;
          return;
        }
        if (!Array.isArray(question.choices) || question.choices.length < 1) {
          hasInvalid = true;
          errorMsg += `القسم ${sIdx + 1}، السؤال ${qIdx + 1}: يجب أن يحتوي على خيار واحد على الأقل.\n`;
          return;
        }
        question.choices.forEach((choice, cIdx) => {
          if (!choice.text || choice.text.trim() === '') {
            hasInvalid = true;
            errorMsg += `القسم ${sIdx + 1}، السؤال ${qIdx + 1}، الخيار ${cIdx + 1}: نص الخيار مفقود.\n`;
          }
        });
      });
    });

    if (hasInvalid) {
      alert(errorMsg);
      return;
    }

    try {
      // Create question bank
      const { data: bank, error: bankError } = await supabase
        .from('question_banks')
        .insert({ name: bankName })
        .select()
        .single();

      if (bankError) throw bankError;

      // Prepare questions for insertion with choice weights
      const questionsToInsert: Array<{
        text: string;
        choices: Array<{text: string; weight: number}>;
        section: string;
        weight: number;
        bank_id: string;
      }> = [];
      sections.forEach(section => {
        section.questions.forEach(question => {
          questionsToInsert.push({
            text: question.text,
            choices: question.choices.map(c => ({
              text: c.text,
              weight: c.weight
            })),
            section: section.name,
            weight: section.weight,
            bank_id: bank.id
          });
        });
      });

      // Insert questions
      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionsToInsert);

      if (questionsError) throw questionsError;

      alert(`✅ تم حفظ ${questionsToInsert.length} سؤال في البنك بنجاح!`);
      
      // Reset form
      setSections([]);
      setBankName('');
      addSection();
      loadData();
    } catch (error) {
      console.error('Error saving questions:', error);
      alert('خطأ في حفظ الأسئلة');
    }
  };

  const pointsDistribution = calculatePointsDistribution();

  return (
    <div className="container">
      <div className="header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>📝</span>
          إدارة الأسئلة
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '16px' }}>
          قم بإنشاء وتنظيم الأسئلة في أقسام مختلفة مع تحديد الأوزان والنقاط
        </p>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <button 
          className={`btn ${showExisting ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setShowExisting(false)}
        >
          <span>➕</span>
          إضافة أسئلة جديدة
        </button>
        <button 
          className={`btn ${showExisting ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowExisting(true)}
        >
          <span>📚</span>
          عرض الأسئلة الموجودة
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/host')} style={{ marginRight: 'auto' }}>
          <span>🔙</span>
          العودة للإدارة
        </button>
      </div>

      {showExisting ? (
        // Existing Questions View
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">📚</div>
              <span>الأسئلة الموجودة ({existingQuestions.length})</span>
            </div>
          </div>
          
          {loading ? (
            <div className="empty-state">جاري التحميل...</div>
          ) : existingQuestions.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
              <h3>لا توجد أسئلة</h3>
              <p>ابدأ بإضافة أسئلة جديدة</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {existingQuestions.map((question, index) => (
                <div key={question.id} style={{
                  background: 'var(--secondary-light)',
                  padding: '20px',
                  borderRadius: '8px',
                  borderRight: '4px solid var(--primary-color)',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    background: 'var(--primary-color)',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}>
                    {index + 1}
                  </div>
                  
                  <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '12px', paddingLeft: '40px' }}>
                    {question.text}
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '8px'
                  }}>
                    {question.choices.map((choice, idx) => {
                      const choiceText = typeof choice === 'string' ? choice : choice.text;
                      const choiceWeight = typeof choice === 'string' ? 1 : choice.weight;
                      return (
                        <div key={idx} style={{
                          padding: '8px 12px',
                          background: 'white',
                          border: '2px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>•</span>
                            <span>{choiceText}</span>
                          </div>
                          {typeof choice !== 'string' && (
                            <span style={{ 
                              fontSize: '12px', 
                              color: 'var(--text-secondary)',
                              background: 'var(--secondary-light)',
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}>
                              وزن: {choiceWeight}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <strong>القسم:</strong> {question.section} | <strong>الوزن:</strong> {question.weight}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Add New Questions View
        <>
          <div className="card" style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '14px' }}>
                اسم بنك الأسئلة
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="أدخل اسم البنك (مطلوب)"
                style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--border-color)', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '14px' }}>
                إجمالي النقاط
              </label>
              <input
                type="number"
                value={totalPoints}
                onChange={(e) => setTotalPoints(parseFloat(e.target.value) || 100)}
                min="1"
                style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--border-color)', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            <button className="btn btn-primary" onClick={addSection}>
              <span>➕</span>
              إضافة قسم جديد
            </button>
          </div>

          {sections.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
                <p>لا توجد أقسام بعد. اضغط على "إضافة قسم جديد" للبدء</p>
              </div>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="card" style={{ borderRight: '4px solid var(--primary-color)' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '16px',
                  marginBottom: '20px',
                  borderBottom: '2px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>📂</span>
                    <input
                      type="text"
                      value={section.name}
                      onChange={(e) => updateSectionName(section.id, e.target.value)}
                      placeholder="اسم القسم"
                      style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        border: '2px solid transparent',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'var(--secondary-light)'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label>الوزن:</label>
                    <input
                      type="number"
                      value={section.weight}
                      onChange={(e) => updateSectionWeight(section.id, parseFloat(e.target.value) || 1)}
                      min="0.1"
                      step="0.1"
                      style={{ width: '80px', padding: '8px', border: '2px solid var(--border-color)', borderRadius: '6px', textAlign: 'center' }}
                    />
                    <button className="btn btn-danger btn-sm" onClick={() => removeSection(section.id)}>
                      <span>🗑️</span>
                    </button>
                  </div>
                </div>

                {section.questions.map((question, qIdx) => (
                  <div key={qIdx} style={{
                    background: 'var(--secondary-light)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '16px',
                      left: '16px',
                      background: 'var(--primary-color)',
                      color: 'white',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}>
                      {qIdx + 1}
                    </div>

                    <textarea
                      value={question.text}
                      onChange={(e) => updateQuestionText(section.id, qIdx, e.target.value)}
                      placeholder="اكتب نص السؤال هنا..."
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px solid var(--border-color)',
                        borderRadius: '6px',
                        fontSize: '14px',
                        resize: 'vertical',
                        minHeight: '80px',
                        marginBottom: '12px'
                      }}
                    />

                    {question.choices.map((choice, cIdx) => (
                      <div key={cIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--primary-color)', fontSize: '20px', fontWeight: 'bold' }}>•</span>
                        <input
                          type="text"
                          value={choice.text}
                          onChange={(e) => updateChoice(section.id, qIdx, cIdx, e.target.value)}
                          placeholder={`خيار ${cIdx + 1}`}
                          style={{ flex: 1, padding: '10px', border: '2px solid var(--border-color)', borderRadius: '6px', fontSize: '14px' }}
                        />
                        <label style={{ margin: '0 8px' }}>الوزن:</label>
                        <input
                          type="number"
                          value={choice.weight}
                          onChange={(e) => updateChoiceWeight(section.id, qIdx, cIdx, parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.1"
                          placeholder="الوزن"
                          style={{ width: '80px', padding: '10px', border: '2px solid var(--border-color)', borderRadius: '6px', textAlign: 'center' }}
                        />
                      </div>
                    ))}

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => addChoice(section.id, qIdx)}>
                          <span>➕</span>
                          إضافة خيار
                        </button>
                        {question.choices.length > 1 && (
                          <button className="btn btn-danger btn-sm" onClick={() => removeChoice(section.id, qIdx)}>
                            <span>➖</span>
                            إزالة آخر خيار
                          </button>
                        )}
                      </div>
                      <button className="btn btn-danger btn-sm" onClick={() => removeQuestion(section.id, qIdx)}>
                        <span>🗑️</span>
                        حذف السؤال
                      </button>
                    </div>
                  </div>
                ))}

                <button className="btn btn-primary btn-sm" onClick={() => addQuestion(section.id)}>
                  <span>➕</span>
                  إضافة سؤال
                </button>
              </div>
            ))
          )}

          {sections.length > 0 && (
            <div className="card" style={{ borderTop: '4px solid var(--success-color)' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📊</span>
                توزيع النقاط
              </h3>
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>القسم</th>
                    <th>الوزن</th>
                    <th>عدد الأسئلة</th>
                    <th>إجمالي النقاط</th>
                    <th>النقاط لكل سؤال</th>
                  </tr>
                </thead>
                <tbody>
                  {pointsDistribution.map((data, idx) => (
                    <tr key={idx}>
                      <td>{data.name}</td>
                      <td>{data.weight}</td>
                      <td>{data.questionCount}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{data.totalPoints}</td>
                      <td>{data.pointsPerQuestion}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--primary-light)', fontWeight: 600 }}>
                    <td colSpan={3}>المجموع</td>
                    <td style={{ color: 'var(--primary-color)' }}>{totalPoints}</td>
                    <td>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginTop: '20px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}>
            <button className="btn btn-success" onClick={saveQuestions}>
              <span>💾</span>
              حفظ الأسئلة
            </button>
          </div>
        </>
      )}
    </div>
  );
}
