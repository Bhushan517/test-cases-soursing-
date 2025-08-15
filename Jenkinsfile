def nextVersionFromGit(scope) {
    def latestVersion = sh( returnStdout: true, script: 'git tag --sort=v:refname | tail -n 1 || echo v1.0.0').trim()
    def statusCode = sh(returnStatus: true, script: "git diff-index --quiet ${latestVersion}")
    println("statusCode is ${statusCode}")
    if ( build_env == "prod" ) {
        def nextVersion = "${release_tag}"
        create_tag = "false"
        println("line 8 create_tag is ${create_tag} => build_env is ${env.build_env}")
        return nextVersion
    } else if ( build_env == "dev" && statusCode == 0 ) {
        def nextVersion = "${latestVersion}"
        create_tag = "false"
        println("line 12 create_tag is ${create_tag} => build_env is ${env.build_env}")
        return nextVersion
    } else {
    print latestVersion
    def (major, minor, patch) = latestVersion.minus('v').tokenize('.').collect { it.toInteger() }
    def nextVersion
    switch (scope) {
        case 'major':
            nextVersion1 = "${major + 1}.0.0"
            nextVersion = "v${nextVersion1}"
            create_tag = "true"
            break
        case 'minor':
            nextVersion1 = "${major}.${minor + 1}.0"
            nextVersion = "v${nextVersion1}"
            create_tag = "true"
            break
        case 'patch':
            nextVersion1 = "${major}.${minor}.${patch + 1}"
            nextVersion = "v${nextVersion1}"
            create_tag = "true"
            break
        default:
            nextVersion = "none"
            create_tag = "false"
            break
    }
    println("line 40 create_tag is ${create_tag} => build_env is ${env.build_env}")
    println("currentTagVersion is ${latestVersion} => LatestTagVersion is ${nextVersion}")
    return nextVersion
  }
}
pipeline {
    agent any

    //tools {
    //    maven "Maven"
    //    jdk "Java-11"
    //}

    environment {
        //region = "us-east-1"
        aws_ecr_arn = "339713133121.dkr.ecr.${region}.amazonaws.com"
        task_def_arn = "arn:aws:ecs:${region}:339713133121:task-definition"
        cluster_arn = "arn:aws:ecs:${region}:339713133121:cluster"
        ROLE_ARN = 'arn:aws:iam::339713133121:role/jenkins-global-assume-role'
        ROLE_SESSION_NAME = "jenkins-global-assume-role-${build_env}-${module_name}"
        PROFILE_NAME = 'assume-role-profile'
        module_name = "${module_name}"
        container_port = "${container_port}"
        host_port = "${container_port}"
        build_time = sh(script: "echo `date +%F-%T-%Z`", returnStdout: true).trim()
        tag_name = nextVersionFromGit(env.release_type)
    }

    stages {
        stage('SonarQube analysis') {
        when{
            allOf {
                expression { return env.build_env == "dev" }
                expression { return env.branch == "*/core-release" }
            }
        }
            environment{
            JAVA_HOME= '/usr/lib/jvm/jdk-17-oracle-x64'
        }
        steps{
            script{
                def scannerHome = tool env.sonarqube_scanner;
                def project_key=env.sonar_project_key;
                withSonarQubeEnv(env.sonarqube_env) {
                    sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectKey=${project_key}"
                }
            }
        }
    }
    stage('Quality Gate') {
        when{
            allOf {
                expression { return env.build_env == "dev"}
                expression { return env.branch == "*/core-release" }
            }
        }
        steps {
            timeout(time: 5, unit: 'MINUTES') {
                script {
                    def qualityGate = waitForQualityGate()
                    if (qualityGate.status != 'OK') {
                        echo "Quality Gate did not pass. Quality Gate status: ${qualityGate.status}"
                    }
                }
            }
        }
    }
        stage('Add Config files') {
            steps {
                configFileProvider([configFile(fileId: 'v4-common-config', replaceTokens: true, targetLocation: 'taskdef.json')]) {
                    // Configuration file provided
                }
            }
        }

        stage('Build Docker') {
            steps {
                script {
                    commit_id = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    sh "docker build --no-cache --pull . -t ${aws_ecr_arn}/${project_env}/${module_name}:build-v${BUILD_NUMBER}"
                }
            }
        }

        stage('Assume Role') {
            steps {
                script {
                    // Debugging: Capture output and errors
                    def assumeRoleOutput = sh(
                        script: """
                            aws sts assume-role \
                                --role-arn ${ROLE_ARN} \
                                --role-session-name ${ROLE_SESSION_NAME} \
                                --region ${region} \
                                --output json
                        """,
                        returnStdout: true
                    ).trim()

                    echo "Assume Role Output: ${assumeRoleOutput}"

                    //def json = readJSON text: assumeRoleOutput
                    //def accessKeyId = json.Credentials.AccessKeyId
                    //def secretAccessKey = json.Credentials.SecretAccessKey
                    //def sessionToken = json.Credentials.SessionToken

                    sh """                    
                    value=\$(aws sts assume-role \
                                --role-arn ${ROLE_ARN} \
                                --role-session-name ${ROLE_SESSION_NAME} \
                                --region ${region} \
                                --output json)
 
                    access_key_id=\$(echo "\$value" | jq -r '.Credentials.AccessKeyId')
                    secret_access_key=\$(echo \$value | jq -r '.Credentials.SecretAccessKey')
                    session_token=\$(echo \$value | jq -r '.Credentials.SessionToken')       
                    aws configure --profile assume-role-profile set aws_access_key_id \$access_key_id
                    aws configure --profile assume-role-profile set aws_secret_access_key \$secret_access_key
                    aws configure --profile assume-role-profile set aws_session_token \$session_token
                    aws configure --profile assume-role-profile set region ${region}
                    aws configure --profile assume-role-profile set output json
                    aws configure list-profiles
                    """
                    
                }
            }
        }

        stage('Docker Login and Push') {
            steps {
                sh "/usr/local/bin/aws ecr get-login-password --region ${region} --profile ${PROFILE_NAME} | docker login --username AWS --password-stdin ${aws_ecr_arn}"
                sh "docker push ${aws_ecr_arn}/${project_env}/${module_name}:build-v${BUILD_NUMBER}"
            }
        }

        stage('Deploy') {
            steps {
                sh "/usr/local/bin/aws ecs register-task-definition --family ${project_env}-${module_name}-task --cli-input-json file://taskdef.json --region ${region} --profile ${PROFILE_NAME}"
                sh "/usr/local/bin/aws --region ${region} ecs update-service --cluster ${cluster_arn}/${project_env}-v4-ecs --service ${project_env}-${module_name}-service --task-definition ${task_def_arn}/${project_env}-${module_name}-task --profile ${PROFILE_NAME} --propagate-tags TASK_DEFINITION"
            }
        }
        stage('createTag') {
        when {
            allOf {
                expression { return create_tag == "true" }
                expression { return env.build_env == "dev" }
            }
        }

        steps {

            sh "git tag -a ${tag_name} -m 'release version ${tag_name}'"
            sh "echo ${tag_name}"
            sshagent(['simplify_deployment_ssh_key']) {
                sh("git push origin ${tag_name}")
            }

        }
    }
    stage('BOM file creation') {
        when{
            allOf {
                expression { return env.build_env == "dev" }
                expression { return env.branch == "*/core-release" }
            }
        }
        steps {
            sh 'composer global require cyclonedx/cyclonedx-php-composer'
            sh 'composer CycloneDX:make-sbom'
           }
    }

    stage('Upload BOM to DependencyTrack') {
        when{
            allOf {
                expression { return env.build_env == "dev" }
                expression { return env.branch == "*/core-release" }
            }
        }
        steps {
            dependencyTrackPublisher(
                artifact: 'bom.xml',
                autoCreateProjects: true,
                dependencyTrackApiKey: 'Inspector-DT', // Your DependencyTrack API key.
                dependencyTrackFrontendUrl: 'https://${url}', // The URL to your DependencyTrack instance.
                //dependencyTrackUrl: '', // Leave this empty if you're using the default URL.
                overrideGlobals: true,
                projectName: env.sonar_project_key,
                projectVersion: '1.0',
                projectProperties: [
                    description: 'php-project', // Project description
                    group: 'php-project', // Project group
                    parentId: 'b873cdc5-cc35-4e95-849f-c2b66b71a14c' // Parent project ID
                ],
                //parentId: 'b873cdc5-cc35-4e95-849f-c2b66b71a14c',
                synchronous: true,
            )
        }
    }
    
    }

    post {
        always {
        sh """
                sed -i '/\\[${PROFILE_NAME}\\]/,+3d' ~/.aws/credentials
                sed -i '/\\[profile ${PROFILE_NAME}\\]/,+1d' ~/.aws/config
                rm -rf /var/lib/jenkins/.aws/config
            """
        }
        failure {
            emailext (
                to: 'devops@simplifyvms.com',
                subject: "Failed Pipeline: ${currentBuild.fullDisplayName}",
                body: "Something is wrong with ${env.BUILD_URL}",
                recipientProviders: [[$class: 'DevelopersRecipientProvider']]
            )
        }
    }
}
