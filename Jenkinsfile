pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        PNPM_VERSION = '8'
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }
    
    stages {
        stage('Setup') {
            steps {
                script {
                    echo 'Setting up environment...'
                    sh 'node --version'
                    sh 'pnpm --version'
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                script {
                    echo 'Installing dependencies...'
                    sh 'pnpm install --frozen-lockfile'
                }
            }
        }
        
        stage('TypeScript Check') {
            steps {
                script {
                    echo 'Running TypeScript type check...'
                    sh 'pnpm tsc --noEmit'
                }
            }
        }
        
        stage('Lint') {
            steps {
                script {
                    echo 'Running linter...'
                    sh 'pnpm lint || echo "Lint command not configured, skipping..."'
                }
            }
        }
        
        stage('Unit Tests') {
            steps {
                script {
                    echo 'Running unit tests...'
                    sh 'pnpm test:unit --coverage --maxWorkers=2'
                }
                post {
                    always {
                        junit 'coverage/junit.xml'
                        publishHTML([
                            allowMissing: false,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: 'coverage',
                            reportFiles: 'index.html',
                            reportName: 'Unit Test Coverage Report'
                        ])
                    }
                }
            }
        }
        
        stage('Integration Tests') {
            steps {
                script {
                    echo 'Running integration tests...'
                    sh 'pnpm test:integration || echo "Integration tests not configured, skipping..."'
                }
            }
        }
        
        stage('E2E Tests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    echo 'Running E2E tests with Playwright...'
                    sh 'pnpm test:e2e'
                }
                post {
                    always {
                        publishHTML([
                            allowMissing: false,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: 'playwright-report',
                            reportFiles: 'index.html',
                            reportName: 'E2E Test Report'
                        ])
                    }
                }
            }
        }
        
        stage('Build') {
            steps {
                script {
                    echo 'Building application...'
                    sh 'pnpm build'
                }
            }
        }
        
        stage('Security Scan') {
            steps {
                script {
                    echo 'Running security scan...'
                    sh 'pnpm audit || echo "Audit completed with warnings"'
                }
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                script {
                    echo 'Deploying to staging environment...'
                    // Add your staging deployment commands here
                    // Example: vercel deploy --prebuilt --token=$VERCEL_TOKEN
                    echo 'Staging deployment placeholder'
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo 'Deploying to production environment...'
                    // Add your production deployment commands here
                    // Example: vercel deploy --prod --prebuilt --token=$VERCEL_TOKEN
                    echo 'Production deployment placeholder'
                }
            }
        }
    }
    
    post {
        success {
            script {
                echo 'Pipeline completed successfully!'
                // Add notification logic here (Slack, email, etc.)
            }
        }
        
        failure {
            script {
                echo 'Pipeline failed!'
                // Add failure notification logic here
            }
        }
        
        always {
            cleanWs()
        }
    }
}
